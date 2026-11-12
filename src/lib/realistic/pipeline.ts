import "server-only";
import { after } from "next/server";
import { withDeadline } from "@/lib/video/generateAssets";
import { generateRealisticScript } from "./script";
import { generateRealisticImage } from "./images";
import { advanceRealisticVideo } from "./advance";
import {
  isRealisticStyle,
  realisticCreditCost,
  realisticDurationFromLabel,
  realisticSceneCount,
  type RealisticScript,
} from "./constants";
import { publicStorageUrl, REALISTIC_BUCKET, type RealisticVideoRow } from "./row";
import { extractErrorMessage, parseRealisticDbError, type ServiceClient } from "./common";
import type { SeriesRow } from "@/components/dashboard/seriesMapping";
import { buildSeriesMemory, describeNicho, toPastEpisode } from "@/lib/series/memory";

export { extractErrorMessage, parseRealisticDbError };
export type { ServiceClient };

export function imagePath(userId: string, videoId: string, index: number): string {
  // Nome novo a cada geração: trocar uma imagem nunca devolve a antiga do cache.
  return `${userId}/realistic/${videoId}/scene_${index}_${Date.now().toString(36)}.jpg`;
}

async function uploadImage(supabase: ServiceClient, path: string, image: Buffer): Promise<void> {
  const { error } = await supabase.storage
    .from(REALISTIC_BUCKET)
    .upload(path, image, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Falha ao salvar a imagem: ${error.message}`);
}

type ImageRow = Pick<RealisticVideoRow, "id" | "user_id" | "realistic_style">;

// Gera e salva as imagens das cenas `indices`. `existing` são as imagens atuais
// (por cena). Personagem fixo: a descrição dele entra igual em toda cena em que
// aparece e, quando há uma imagem dele já pronta (de uma cena que NÃO está sendo
// refeita), ela vai como referência — assim o rosto não muda. Sem imagem pronta,
// a primeira cena com o personagem é criada antes e vira a referência das outras.
async function renderScenes(
  supabase: ServiceClient,
  row: ImageRow,
  script: RealisticScript,
  indices: number[],
  existing: (string | null)[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const character = script.character?.trim() || null;
  const hasCharacter = (i: number) => !!character && script.scenes[i].showsCharacter !== false;

  const generate = async (i: number, referencePath: string | null): Promise<string> => {
    const image = await generateRealisticImage({
      imagePrompt: script.scenes[i].imagePrompt,
      styleName: row.realistic_style,
      character: hasCharacter(i) ? character : null,
      referenceUrl: hasCharacter(i) && referencePath ? publicStorageUrl(referencePath) : null,
    });
    const path = imagePath(row.user_id, row.id, i);
    await uploadImage(supabase, path, image);
    out.set(i, path);
    return path;
  };

  let referencePath: string | null = null;
  if (character) {
    const keep = existing.findIndex((path, i) => !!path && hasCharacter(i) && !indices.includes(i));
    if (keep >= 0) referencePath = existing[keep];
  }

  let rest = indices;
  if (character && !referencePath) {
    const anchor = indices.find(hasCharacter);
    if (anchor !== undefined) {
      referencePath = await generate(anchor, null);
      rest = indices.filter((i) => i !== anchor);
    }
  }
  await Promise.all(rest.map((i) => generate(i, referencePath)));
  return out;
}

// Gera (e salva) as imagens da prévia (6 ou 12). Grava os caminhos em
// scene_images. Não gasta crédito.
export async function generateSceneImages(
  supabase: ServiceClient,
  row: ImageRow,
  script: RealisticScript,
): Promise<string[]> {
  const all = script.scenes.map((_, i) => i);
  const made = await renderScenes(supabase, row, script, all, []);
  const paths = all.map((i) => made.get(i) as string);
  const { error } = await supabase.from("realistic_videos").update({ scene_images: paths }).eq("id", row.id);
  if (error) throw new Error(`Falha ao guardar as imagens: ${error.message}`);
  return paths;
}

// Refaz as imagens de algumas cenas (edição de texto ou "Trocar"), mantendo o
// mesmo personagem. Devolve a lista completa de caminhos; NÃO grava no banco
// (quem chama grava junto com o roteiro, tudo ou nada).
export async function regenerateSceneImages(
  supabase: ServiceClient,
  row: ImageRow,
  script: RealisticScript,
  indices: number[],
  existing: string[],
): Promise<string[]> {
  const made = await renderScenes(supabase, row, script, indices, existing);
  return existing.map((path, i) => made.get(i) ?? path);
}

// Começa (em segundo plano, depois da resposta) a geração em etapas de um
// vídeo que acabou de ter o crédito descontado. Ver advance.ts.
export function startRealisticGeneration(service: ServiceClient, videoId: string, origin: string): void {
  after(async () => {
    await advanceRealisticVideo(service, videoId, origin);
  });
}

export type RealisticSeriesResult =
  | { ok: true; video: RealisticVideoRow }
  | { ok: false; error: string; video: RealisticVideoRow | null; alreadyInProgress?: boolean; outOfCredits?: boolean };

// Um episódio realista de uma série, sem aprovação do cliente: gasta os
// créditos (1 para 30s, 2 para 60s), escreve o roteiro, cria as imagens e
// entrega a animação/montagem à geração em etapas (que termina sozinha em
// segundo plano). Sem saldo, PAUSA a série (e o cliente vê o aviso para
// comprar mais). Espelha o papel de runSeriesGeneration para o vídeo normal.
export async function runRealisticSeriesGeneration(
  supabase: ServiceClient,
  userId: string,
  series: SeriesRow,
  origin: string,
): Promise<RealisticSeriesResult> {
  const { data: claimed, error: claimError } = await supabase
    .rpc("claim_series_for_generation", { p_series_id: series.id, p_user_id: userId })
    .single();
  if (claimError || !claimed) {
    return {
      ok: false,
      error: claimError?.message ?? "Esta série já está gerando um vídeo.",
      video: null,
      alreadyInProgress: true,
    };
  }

  const record = (status: "sucesso" | "erro", message: string | null) =>
    supabase.rpc("record_series_generation", {
      p_series_id: series.id,
      p_video_id: null, // a tabela de logs só aponta para public.videos
      p_status: status,
      p_message: message,
      p_user_id: userId,
    });

  // Memória da série: o que os episódios anteriores já contaram e que episódio
  // é este (inclui os ainda animando em segundo plano — o roteiro já existe).
  const { data: recent, count: recentCount } = await supabase
    .from("realistic_videos")
    .select("title, script", { count: "exact" })
    .eq("series_id", series.id)
    .in("status", ["Pronto", "Processando"])
    .order("created_at", { ascending: false })
    .limit(6);
  const recentRows = (recent ?? []) as { title: string; script: unknown }[];
  const episodeNumber = (recentCount ?? recentRows.length) + 1;
  const seriesMemory = buildSeriesMemory({ episodeNumber, past: recentRows.map(toPastEpisode) });

  const style = isRealisticStyle(series.visual_style) ? series.visual_style : "Cinematográfico";
  const duration = realisticDurationFromLabel(series.duration);
  const sceneCount = realisticSceneCount(duration);
  const musicIds = series.background_music_ids ?? [];
  const musicId = musicIds.length > 0 ? musicIds[Math.floor(Math.random() * musicIds.length)] : null;

  const { data: draft, error: draftError } = await supabase
    .from("realistic_videos")
    .insert({
      user_id: userId,
      series_id: series.id,
      mode: "series",
      title: `${series.title} — ${new Date().toLocaleDateString("pt-BR")}`,
      topic: series.title,
      language: series.idioma,
      realistic_style: style,
      duration_seconds: duration,
      credit_cost: realisticCreditCost(duration),
      voice: series.voice,
      captions_enabled: series.captions_enabled,
      caption_style: series.caption_style,
      background_music_id: musicId,
    })
    .select("*")
    .single<RealisticVideoRow>();
  if (draftError || !draft) {
    const message = draftError?.message ?? "Não foi possível preparar o vídeo realista.";
    await record("erro", message);
    return { ok: false, error: message, video: null };
  }

  // Gasta os créditos ANTES de gerar. Sem saldo: pausa a série.
  const { data: spent, error: spendError } = await supabase
    .rpc("spend_realistic_credit", { p_video_id: draft.id, p_user_id: userId })
    .single<RealisticVideoRow>();
  if (spendError || !spent) {
    await supabase.from("realistic_videos").delete().eq("id", draft.id);
    const parsed = parseRealisticDbError(spendError?.message ?? "Não foi possível descontar o crédito.");
    await record("erro", parsed.message);
    if (parsed.code === "no_realistic_credits") {
      await supabase.from("series").update({ status: "pausada" }).eq("id", series.id).eq("user_id", userId);
      return { ok: false, error: parsed.message, video: null, outOfCredits: true };
    }
    return { ok: false, error: parsed.message, video: null };
  }

  try {
    // Roteiro + imagens cabem folgados numa chamada; a animação e a montagem
    // seguem em etapas.
    const prepared = await withDeadline(
      (async () => {
        await supabase
          .from("realistic_videos")
          .update({ progress_stage: "roteiro" })
          .eq("id", spent.id);
        const script = await generateRealisticScript({
          request: series.title,
          kind: "topic",
          language: series.idioma,
          styleName: style,
          sceneCount,
          extra: `${seriesMemory ? `${seriesMemory}\n` : ""}${describeNicho(series.nicho)} Tom de voz: ${series.tom_de_voz}.`,
        });
        await supabase
          .from("realistic_videos")
          .update({
            script,
            title: `${script.title} — ${new Date().toLocaleDateString("pt-BR")}`,
            script_generations: 1,
            progress_stage: "imagens",
          })
          .eq("id", spent.id);
        const paths = await generateSceneImages(supabase, spent, script);
        return { ...spent, script, scene_images: paths } as RealisticVideoRow;
      })(),
      Date.now() + 200_000,
    );

    startRealisticGeneration(supabase, prepared.id, origin);
    await record("sucesso", null);
    return { ok: true, video: prepared };
  } catch (err) {
    console.error("[realistic/series] falhou antes da animação:", err);
    const message = `${extractErrorMessage(err)} Seus créditos realistas foram devolvidos.`;
    const { data: failed } = await supabase
      .rpc("fail_realistic_video", { p_video_id: spent.id, p_message: message })
      .single<RealisticVideoRow>();
    await record("erro", message);
    return { ok: false, error: message, video: failed ?? null };
  }
}
