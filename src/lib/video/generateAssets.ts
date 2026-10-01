import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateScript } from "@/lib/ai/script";
import { buildRenderScenes } from "@/lib/video/scenePipeline";
import { renderFinalVideo } from "@/lib/video/render";

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
}): Promise<{ finalVideo: Buffer; thumbnail: Buffer | undefined }> {
  await input.report("roteiro");
  const script = await generateScript(input.script);

  const scenes = await buildRenderScenes(script, input.voice, input.visualStyle, input.language, input.report);

  const finalVideo = await renderFinalVideo(
    scenes,
    input.captionsEnabled,
    input.captionStyle,
    input.backgroundMusic,
    (current, total) => input.report("montagem", current, total),
  );

  return { finalVideo, thumbnail: scenes[0]?.image };
}
