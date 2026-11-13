import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateExtraScenes, generateScript, type Script } from "@/lib/ai/script";
import { applyCaptionFailureNoCharge, type CaptionState } from "@/lib/ai/captions";
import { buildRenderScenes } from "@/lib/video/scenePipeline";
import { probeVideoDuration, renderFinalVideo, totalSceneSeconds, type RenderScene } from "@/lib/video/render";
import { durationRule, LAST_RESORT_MIN_TEMPO, planFit, SAFETY_MARGIN, SECONDS_PER_SCENE } from "@/lib/video/durationTarget";

// Etapas gravadas em videos.progress_stage (migration 0025) e mostradas na
// tela. "salvando" é o upload final, exibido junto com a montagem.
export type ProgressStage = "roteiro" | "voz" | "imagens" | "montagem" | "salvando";

export type ReportProgress = (stage: ProgressStage, current?: number, total?: number) => Promise<void>;

// As rotas de geração têm maxDuration=300s (teto do plano Hobby da Vercel).
// Se a função é encerrada nesse limite, NENHUM código roda depois — era
// assim que um vídeo de 60s ficava em "Gerando" para sempre. Com este prazo
// a geração desiste sozinha aos 270s, sobrando tempo para marcar o vídeo
// como "Falhou" e responder. (A rede de segurança para quando nem isso
// roda é o expire_stale_videos de 10 minutos.)
export const GENERATION_TIME_BUDGET_MS = 270_000;

export class GenerationTimeoutError extends Error {
  constructor() {
    super(
      'A geração demorou mais que o limite e foi interrompida. Clique em "Tentar de novo" — este vídeo não foi descontado do seu limite diário.',
    );
    this.name = "GenerationTimeoutError";
  }
}

// Corre `work` contra o prazo. Ao estourar, rejeita na hora; o trabalho em
// andamento não é cancelado (não há como interromper uma chamada de API no
// meio), mas o fluxo já consegue marcar a falha antes de a Vercel encerrar
// a função.
export async function withDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new GenerationTimeoutError();

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new GenerationTimeoutError()), remaining);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Grava a etapa atual do vídeo. Falha aqui nunca derruba a geração — o
// progresso é só informativo.
export function createProgressReporter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  videoId: string,
  userId?: string,
): ReportProgress {
  return async (stage, current, total) => {
    const { error } = await supabase.rpc("set_video_progress", {
      p_video_id: videoId,
      p_stage: stage,
      p_current: current ?? null,
      p_total: total ?? null,
      p_user_id: userId ?? null,
    });
    if (error) console.warn(`[video/progress] falha ao gravar etapa "${stage}":`, error.message);
  };
}

// Roteiro → narração/imagens/legendas por cena → vídeo final. Comum aos 3
// fluxos de geração (manual, "Tentar de novo" e séries).
export async function generateVideoAssets(input: {
  script: Parameters<typeof generateScript>[0];
  voice: string;
  visualStyle: string;
  language?: "pt" | "en" | "es";
  captionsEnabled: boolean;
  captionStyle: string | null;
  backgroundMusic?: Buffer;
  report: ReportProgress;
  // Vídeo que está sendo gerado: se a legenda falhar e ele sair sem legenda,
  // o custo dele (vaga do dia/bônus) é devolvido ao cliente.
  videoId?: string;
}): Promise<{ finalVideo: Buffer; thumbnail: Buffer | undefined; script: Script; captionsFailed: boolean }> {
  await input.report("roteiro");
  const script = await generateScript(input.script);

  // Se a Groq (legenda) falhar de vez, o vídeo sai sem legenda em vez de falhar.
  const captionState: CaptionState = { failed: false, reason: null };
  const captions = { enabled: input.captionsEnabled, state: captionState, context: input.videoId ? `vídeo ${input.videoId}` : undefined };
  let scenes = await buildRenderScenes(script, input.voice, input.visualStyle, input.language, input.report, captions);

  const rule = durationRule(input.script.duration);
  if (rule) {
    // Até 3 rodadas de cenas de reforço se a narração sair curta (a 2ª só
    // roda se a 1ª ainda não bastou); depois, ajuste fino da velocidade.
    for (let round = 0; round < 3; round++) {
      const plan = planFit(totalSceneSeconds(scenes), rule);
      if (plan.kind !== "extend") break;
      const count = Math.min(3, Math.max(1, Math.ceil(plan.missingSeconds / SECONDS_PER_SCENE)));
      const extra = await generateExtraScenes({
        script,
        count,
        visualStyle: input.visualStyle,
        language: input.language,
      });
      if (extra.length === 0) break;
      const extraScenes = await buildRenderScenes(
        { title: script.title, scenes: extra },
        input.voice,
        input.visualStyle,
        input.language,
        input.report,
        captions,
      );
      scenes = [...scenes, ...extraScenes];
    }
    scenes = fitTempo(scenes, rule);
    const slow = scenes.some((s) => (s.tempo ?? 1) < 1);
    console.log(`[video/duration] voz desacelerada=${slow ? "sim" : "nao"} cenas=${scenes.length}`);
  }

  const render = () =>
    renderFinalVideo(
      scenes,
      input.captionsEnabled,
      input.captionStyle,
      input.backgroundMusic,
      (current, total) => input.report("montagem", current, total),
    );

  let finalVideo = await render();

  if (rule) {
    // Passar do máximo é aceito. Abaixo do mínimo nunca é entregue: se o
    // MP4 medido sair curto (não deveria), alonga a voz o necessário e
    // monta de novo. Duração nunca vira erro para o cliente.
    for (let attempt = 0; attempt < 2; attempt++) {
      const seconds = await probeVideoDuration(finalVideo);
      console.log(`[video/duration] escolhida=${input.script.duration} final=${seconds.toFixed(2)}s mínimo=${rule.min}s`);
      if (seconds >= rule.min) break;
      const factor = Math.max(LAST_RESORT_MIN_TEMPO, seconds / (rule.min + 2 * SAFETY_MARGIN));
      scenes = scenes.map((s) => ({ ...s, tempo: (s.tempo ?? 1) * factor }));
      finalVideo = await render();
    }
  }

  // `script` volta para quem chamou poder guardá-lo (memória das séries). As
  // cenas de reforço entram na narração, mas o roteiro base já basta para isso.
  if (captionState.failed && input.videoId) await applyCaptionFailureNoCharge(input.videoId, "video");

  return { finalVideo, thumbnail: scenes[0]?.image, script, captionsFailed: captionState.failed };
}

// Garante o mínimo da faixa alongando a voz de leve (cenas de reforço já
// foram tentadas antes). Acima do máximo não mexe: entrega como está.
function fitTempo(scenes: RenderScene[], rule: { min: number; max: number }): RenderScene[] {
  const total = totalSceneSeconds(scenes);
  const plan = planFit(total, rule);
  if (plan.kind === "ok") return scenes;
  const tempo =
    plan.kind === "tempo" ? plan.tempo : Math.max(LAST_RESORT_MIN_TEMPO, total / (rule.min + 2 * SAFETY_MARGIN));
  return scenes.map((s) => ({ ...s, tempo: (s.tempo ?? 1) * tempo }));
}
