import "server-only";
import { createHash } from "node:crypto";
import { synthesizeNarration } from "@/lib/ai/narration";
import { applyCaptionFailureNoCharge, transcribeResilient, type CaptionState } from "@/lib/ai/captions";
import { measureAudioSeconds } from "@/lib/video/audioBatch";
import { loadBackgroundMusic } from "@/lib/video/music";
import { checkAnimation, submitAnimation } from "./animate";
import { renderRealisticVideo, type RealisticRenderScene } from "./render";
import {
  publicStorageUrl,
  REALISTIC_BUCKET,
  type FalJob,
  type NarrationItem,
  type RealisticVideoRow,
} from "./row";
import {
  describeError,
  extractErrorMessage,
  isTransientError,
  retryDb,
  retryTransient,
  sleep,
  type ServiceClient,
} from "./common";

// Geração em ETAPAS. Uma chamada de função não aguenta esperar a fila do
// fal.ai (12 cenas de 60s podem levar bem mais que 270s), então:
//   1. a primeira chamada envia todas as cenas à fila do fal.ai e gera a voz;
//   2. cada chamada acompanha a fila por até ~4,5 min e, se ainda faltar,
//      PASSA O BASTÃO para uma nova chamada (POST em /advance) — sem depender
//      da aba do cliente aberta;
//   3. quando tudo está pronto, uma chamada com tempo de sobra monta o vídeo.
// O estado (pedidos do fal.ai, clipes, voz) fica no banco e no Storage; a
// trava stage_lock_at garante que só uma chamada toque o vídeo por vez. Se a
// corrente quebrar, a consulta da tela (GET /api/realistic/[id]) a retoma.

const RUN_BUDGET_MS = 270_000;
const POLL_MS = 5_000;
// Montar o vídeo (ffmpeg + upload) precisa desta folga; senão passa o bastão.
const FINALIZE_MIN_MS = 180_000;
// Quem toca o vídeo renova a trava a cada ciclo; sem renovar por este tempo, ela vale como abandonada.
export const STAGE_LOCK_STALE_MS = 40_000;
const MAX_SCENE_ATTEMPTS = 2;

// Segredo derivado da chave de serviço: só o próprio servidor o conhece (não
// precisa de variável nova) e protege a rota /advance de chamadas externas.
export function advanceSecret(): string {
  return createHash("sha256")
    .update(`realistic-advance:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`)
    .digest("hex");
}

export async function triggerAdvance(origin: string, videoId: string): Promise<void> {
  try {
    await fetch(`${origin}/api/realistic/${videoId}/advance`, {
      method: "POST",
      headers: { "x-realistic-secret": advanceSecret() },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    // Sem o bastão a tela retoma sozinha (ver isStalled / GET).
    console.warn("[realistic/advance] não consegui passar o bastão:", err);
  }
}

export function isStalled(row: Pick<RealisticVideoRow, "status" | "stage_lock_at">): boolean {
  if (row.status !== "Processando") return false;
  if (!row.stage_lock_at) return true;
  return Date.now() - new Date(row.stage_lock_at).getTime() > STAGE_LOCK_STALE_MS;
}

async function acquireLock(service: ServiceClient, videoId: string): Promise<RealisticVideoRow | null> {
  const staleIso = new Date(Date.now() - STAGE_LOCK_STALE_MS).toISOString();
  const { data } = await retryDb(() =>
    service
      .from("realistic_videos")
      .update({ stage_lock_at: new Date().toISOString() })
      .eq("id", videoId)
      .eq("status", "Processando")
      .or(`stage_lock_at.is.null,stage_lock_at.lt.${staleIso}`)
      .select("*")
      .maybeSingle<RealisticVideoRow>(),
  );
  return data ?? null;
}

async function save(service: ServiceClient, videoId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await retryDb(() => service.from("realistic_videos").update(patch).eq("id", videoId));
  if (error) throw new Error(`Falha ao gravar o andamento: ${error.message}`);
}

function clipPath(video: RealisticVideoRow, index: number): string {
  return `${video.user_id}/realistic/${video.id}/clip_${index}.mp4`;
}

function audioPath(video: RealisticVideoRow, index: number): string {
  return `${video.user_id}/realistic/${video.id}/audio_${index}.mp3`;
}

async function submitScene(video: RealisticVideoRow, index: number): Promise<string> {
  const script = video.script!;
  const imageUrl = publicStorageUrl(video.scene_images![index]);
  return retryTransient(() => submitAnimation(imageUrl, script.scenes[index].motionPrompt));
}

// Voz de todas as cenas (uma de cada vez, por causa do limite da ElevenLabs),
// já salva no Storage com os tempos das palavras para a legenda.
async function narrateAll(service: ServiceClient, video: RealisticVideoRow): Promise<NarrationItem[]> {
  const items: NarrationItem[] = [];
  // Depois que a Groq falha de vez numa cena, as demais não repetem a espera de
  // novo (seriam minutos a mais): ficam direto sem legenda.
  let captionsDown = false;
  for (let i = 0; i < video.script!.scenes.length; i++) {
    // Rede da máquina/servidor pode cair por alguns segundos: refaz SÓ a voz por
    // até ~1 min (2s, 4s, 8s, 16s, 20s) antes de desistir do vídeo.
    const audio = await retryTransient(
      () => synthesizeNarration(video.script!.scenes[i].narration, video.voice ?? ""),
      6,
      2_000,
      20_000,
    );
    // A legenda (Groq) nunca derruba o vídeo: tenta de novo com paciência e, se
    // continuar falhando, a cena fica sem legenda (e o cliente é ressarcido no
    // fim). Legenda desligada: nem chama a Groq; a duração vem do próprio áudio.
    const captionState: CaptionState = { failed: false, reason: null };
    const measured = await measureAudioSeconds(audio);
    if (video.captions_enabled && captionsDown) captionState.failed = true;
    const transcript = video.captions_enabled && !captionsDown
      ? await transcribeResilient({
          audio,
          filename: "narration.mp3",
          language: video.language,
          measuredSeconds: measured,
          state: captionState,
          context: `vídeo realista ${video.id} cena ${i + 1}`,
        })
      : { text: "", durationSeconds: measured, words: [] };
    if (captionState.failed) captionsDown = true;
    const path = audioPath(video, i);
    const { error } = await retryDb(() =>
      service.storage.from(REALISTIC_BUCKET).upload(path, audio, { contentType: "audio/mpeg", upsert: true }),
    );
    if (error) throw new Error(`Falha ao salvar a narração: ${error.message}`);
    items.push({
      audioPath: path,
      durationSeconds: transcript.durationSeconds,
      words: transcript.words,
      ...(captionState.failed ? { captionsFailed: true } : {}),
    });
  }
  return items;
}

async function download(service: ServiceClient, path: string): Promise<Buffer> {
  const { data, error } = await retryDb(() => service.storage.from(REALISTIC_BUCKET).download(path));
  if (error || !data) throw new Error(`Falha ao ler ${path}: ${error?.message ?? "vazio"}`);
  return Buffer.from(await data.arrayBuffer());
}

async function progress(service: ServiceClient, videoId: string, stage: string, current?: number, total?: number) {
  // Só informativo: falhar aqui nunca derruba a geração.
  const { error } = await retryDb(
    () =>
      service
        .from("realistic_videos")
        .update({ progress_stage: stage, progress_current: current ?? null, progress_total: total ?? null })
        .eq("id", videoId)
        .eq("status", "Processando"),
    2,
  ).catch((err) => ({ error: err as Error }));
  if (error) console.warn(`[realistic/advance] falha ao gravar etapa "${stage}":`, error.message);
}

async function failVideo(service: ServiceClient, videoId: string, err: unknown): Promise<void> {
  console.error("[realistic/advance] falhou:", describeError(err));
  const message = `${extractErrorMessage(err)} Seus créditos realistas foram devolvidos.`;
  const { error } = await retryDb(() =>
    service.rpc("fail_realistic_video", { p_video_id: videoId, p_message: message }),
  );
  if (error) console.error("[realistic/advance] fail_realistic_video também falhou:", error);
}

// Roda (ou retoma) a geração de um vídeo 'Processando'. Seguro chamar de
// vários lugares ao mesmo tempo: só quem pega a trava trabalha.
export async function advanceRealisticVideo(
  service: ServiceClient,
  videoId: string,
  origin: string,
): Promise<void> {
  const deadline = Date.now() + RUN_BUDGET_MS;
  const video = await acquireLock(service, videoId);
  if (!video) return;

  try {
    const total = video.script!.scenes.length;

    // Etapa 1: envia as cenas à fila do fal.ai (todas de uma vez).
    let jobs: FalJob[] | null = video.fal_jobs;
    if (!jobs || jobs.length !== total) {
      const ids = await Promise.all(Array.from({ length: total }, (_, i) => submitScene(video!, i)));
      jobs = ids.map((requestId) => ({ requestId, status: "pending", attempts: 1, clipPath: null }));
      await save(service, videoId, { fal_jobs: jobs });
    }
    await progress(service, videoId, "animando", jobs.filter((j) => j.status === "done").length, total);

    // A voz é gerada enquanto o fal.ai trabalha.
    let narration: NarrationItem[] | null = video.narration;
    let narrationError: unknown = null;
    const narrationTask = narration
      ? null
      : narrateAll(service, video)
          .then(async (items) => {
            await save(service, videoId, { narration: items });
            narration = items;
          })
          .catch((err) => {
            narrationError = err;
          });
    void narrationTask;

    // Falhas passageiras de rede seguidas que ainda toleramos antes de desistir.
    let networkStrikes = 0;
    const MAX_NETWORK_STRIKES = 12;

    for (;;) {
      if (narrationError) throw narrationError;

      // Renova a trava e confere se o vídeo ainda está em geração. Falha de
      // rede aqui NÃO encerra: só "não tem resposta" (data vazio sem erro) encerra.
      const { data: current, error: lockError } = await retryDb(() =>
        service
          .from("realistic_videos")
          .update({ stage_lock_at: new Date().toISOString() })
          .eq("id", videoId)
          .eq("status", "Processando")
          .select("id")
          .maybeSingle(),
      );
      if (lockError) {
        if (isTransientError(lockError) && ++networkStrikes < MAX_NETWORK_STRIKES) {
          await sleep(POLL_MS);
          continue;
        }
        throw new Error(`Falha ao renovar a geração: ${lockError.message}`);
      }
      if (!current) return;

      // Etapa 2: confere cada cena pendente. Falha passageira de rede aqui só
      // adia para o próximo ciclo (até MAX_NETWORK_STRIKES vezes seguidas).
      try {
      const pendingIndexes = jobs.map((j, i) => (j.status === "pending" ? i : -1)).filter((i) => i >= 0);
      await Promise.all(
        pendingIndexes.map(async (i) => {
          const job = jobs![i];
          const check = await checkAnimation(job.requestId);
          if (check.state === "pending") return;

          if (check.state === "done") {
            const response = await retryTransient(() => fetch(check.videoUrl));
            if (!response.ok) throw new Error(`Falha ao baixar o clipe da cena ${i + 1} (${response.status}).`);
            const path = clipPath(video!, i);
            const clipBytes = Buffer.from(await response.arrayBuffer());
            const { error } = await retryDb(() =>
              service.storage.from(REALISTIC_BUCKET).upload(path, clipBytes, { contentType: "video/mp4", upsert: true }),
            );
            if (error) throw new Error(`Falha ao salvar o clipe da cena ${i + 1}: ${error.message}`);
            jobs![i] = { ...job, status: "done", clipPath: path };
            return;
          }

          // Cena falhou: tenta de novo 1 vez; se falhar de novo, o vídeo todo falha.
          if (job.attempts >= MAX_SCENE_ATTEMPTS) {
            throw new Error(`A animação da cena ${i + 1} falhou: ${check.message}`);
          }
          console.warn(`[realistic/advance] cena ${i + 1} falhou, reenviando:`, check.message);
          jobs![i] = { requestId: await submitScene(video!, i), status: "pending", attempts: job.attempts + 1, clipPath: null };
        }),
      );

      await save(service, videoId, { fal_jobs: jobs });
      const done = jobs.filter((j) => j.status === "done").length;
      await progress(service, videoId, "animando", done, total);
      networkStrikes = 0;

      // Etapa 3: tudo pronto -> monta o vídeo (se houver tempo de sobra).
      if (done === total && narration) {
        if (deadline - Date.now() < FINALIZE_MIN_MS) break; // sem folga: nova chamada monta
        await finalize(service, { ...video, fal_jobs: jobs, narration });
        return;
      }
      } catch (err) {
        if (isTransientError(err) && ++networkStrikes < MAX_NETWORK_STRIKES) {
          console.warn("[realistic/advance] falha passageira de rede, tentando de novo:", describeError(err));
          await sleep(POLL_MS);
          continue;
        }
        throw err;
      }

      if (deadline - Date.now() < POLL_MS + 8_000) break;
      await sleep(POLL_MS);
    }

    // Passa o bastão: libera a trava e chama uma nova execução.
    await service.from("realistic_videos").update({ stage_lock_at: null }).eq("id", videoId).eq("status", "Processando");
    await triggerAdvance(origin, videoId);
  } catch (err) {
    await failVideo(service, videoId, err);
  }
}

async function finalize(service: ServiceClient, video: RealisticVideoRow): Promise<void> {
  const jobs = video.fal_jobs!;
  const narration = video.narration!;
  const total = jobs.length;
  await progress(service, video.id, "montagem", 0, total);

  const [clips, audios, music] = await Promise.all([
    Promise.all(jobs.map((job) => download(service, job.clipPath!))),
    Promise.all(narration.map((item) => download(service, item.audioPath))),
    loadBackgroundMusic(service, video.background_music_id),
  ]);

  const scenes: RealisticRenderScene[] = clips.map((clip, i) => ({
    clip,
    audio: audios[i],
    narrationSeconds: narration[i].durationSeconds,
    words: narration[i].words,
  }));

  const finalVideo = await renderRealisticVideo(
    scenes,
    video.captions_enabled,
    video.caption_style,
    music,
    async (current, count) => {
      await progress(service, video.id, "montagem", current, count);
      // Mantém a trava viva durante a montagem.
      await service.from("realistic_videos").update({ stage_lock_at: new Date().toISOString() }).eq("id", video.id);
    },
  );

  await progress(service, video.id, "salvando");
  const videoPath = `${video.user_id}/realistic/${video.id}.mp4`;
  const { error: uploadError } = await service.storage
    .from(REALISTIC_BUCKET)
    .upload(videoPath, finalVideo, { contentType: "video/mp4", upsert: true });
  if (uploadError) throw new Error(`Falha ao salvar o vídeo: ${uploadError.message}`);

  // Miniatura = primeira imagem aprovada.
  let thumbnailUrl: string | null = null;
  try {
    const thumbPath = `${video.user_id}/realistic/${video.id}-thumb.jpg`;
    const { error } = await service.storage
      .from(REALISTIC_BUCKET)
      .upload(thumbPath, await download(service, video.scene_images![0]), { contentType: "image/jpeg", upsert: true });
    if (!error) thumbnailUrl = publicStorageUrl(thumbPath);
  } catch {
    // sem miniatura: o vídeo continua válido
  }

  const { error } = await service.rpc("mark_realistic_ready", {
    p_video_id: video.id,
    p_video_url: publicStorageUrl(videoPath),
    p_thumbnail_url: thumbnailUrl,
  });
  if (error) throw new Error(error.message);

  // Alguma cena ficou sem legenda por falha da Groq: devolve os créditos ao cliente.
  if (narration.some((n) => n.captionsFailed)) await applyCaptionFailureNoCharge(video.id, "realistic");

  // Limpeza dos arquivos temporários (clipes e vozes). Falhar aqui é inofensivo.
  await service.storage
    .from(REALISTIC_BUCKET)
    .remove([...jobs.map((j) => j.clipPath!), ...narration.map((n) => n.audioPath)])
    .catch(() => {});
}
