import { NextResponse } from "next/server";
import { anthropic } from "@/lib/ai/anthropic";
import { fal } from "@/lib/ai/fal";
import { elevenlabs } from "@/lib/ai/elevenlabs";
import { groq } from "@/lib/ai/groq";

type ServiceStatus = {
  service: string;
  configured: boolean;
  ok: boolean;
  detail: string;
};

async function checkAnthropic(): Promise<ServiceStatus> {
  const configured = Boolean(process.env.ANTHROPIC_API_KEY);
  if (!configured) {
    return { service: "Anthropic Claude", configured, ok: false, detail: "ANTHROPIC_API_KEY ausente" };
  }
  try {
    await anthropic.models.list({ limit: 1 });
    return { service: "Anthropic Claude", configured, ok: true, detail: "conectado" };
  } catch (err) {
    return {
      service: "Anthropic Claude",
      configured,
      ok: false,
      detail: err instanceof Error ? err.message : "falha desconhecida",
    };
  }
}

async function checkFal(): Promise<ServiceStatus> {
  const configured = Boolean(process.env.FAL_KEY);
  if (!configured) {
    return { service: "fal.ai (Z-Image Turbo)", configured, ok: false, detail: "FAL_KEY ausente" };
  }
  // fal.ai não tem endpoint gratuito de "ping" — a verificação real só
  // acontece na primeira geração de imagem (que tem custo).
  void fal;
  return {
    service: "fal.ai (Z-Image Turbo)",
    configured,
    ok: true,
    detail: "chave configurada (não testada — só é possível verificar gerando uma imagem, o que tem custo)",
  };
}

async function checkElevenLabs(): Promise<ServiceStatus> {
  const configured = Boolean(process.env.ELEVENLABS_API_KEY);
  if (!configured) {
    return { service: "ElevenLabs", configured, ok: false, detail: "ELEVENLABS_API_KEY ausente" };
  }
  try {
    // Usa a permissão "Text to Speech" (a que a narração real precisa),
    // em vez de "voices_read" — nem toda chave tem esse segundo escopo liberado.
    await elevenlabs.textToSpeech.convert("Xb7hH8MSUJpSbSDYk0k2", {
      text: "teste",
      modelId: "eleven_flash_v2_5",
    });
    return { service: "ElevenLabs", configured, ok: true, detail: "conectado (text-to-speech)" };
  } catch (err) {
    return {
      service: "ElevenLabs",
      configured,
      ok: false,
      detail: err instanceof Error ? err.message : "falha desconhecida",
    };
  }
}

async function checkGroq(): Promise<ServiceStatus> {
  const configured = Boolean(process.env.GROQ_API_KEY);
  if (!configured) {
    return { service: "Groq Whisper", configured, ok: false, detail: "GROQ_API_KEY ausente" };
  }
  try {
    await groq.models.list();
    return { service: "Groq Whisper", configured, ok: true, detail: "conectado" };
  } catch (err) {
    return {
      service: "Groq Whisper",
      configured,
      ok: false,
      detail: err instanceof Error ? err.message : "falha desconhecida",
    };
  }
}

export async function GET() {
  const results = await Promise.all([checkAnthropic(), checkFal(), checkElevenLabs(), checkGroq()]);
  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ allOk, results }, { status: allOk ? 200 : 500 });
}
