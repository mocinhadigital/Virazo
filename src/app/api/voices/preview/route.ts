import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { synthesizeNarration } from "@/lib/ai/narration";

// Frase curta e fixa só pra dar uma amostra real do timbre da voz — o
// mesmo texto pra todas, pra comparação justa entre elas.
const PREVIEW_TEXT = "Esta é uma prévia da narração.";

// Só as vozes realmente selecionáveis no wizard (SERIES_VOICES) — evita
// custo de API da ElevenLabs pra nomes arbitrários.
const PREVIEWABLE_VOICES = new Set(["Rafael", "Vicente", "Bianca", "Clara"]);

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const voice = new URL(request.url).searchParams.get("voice");
  if (!voice || !PREVIEWABLE_VOICES.has(voice)) {
    return NextResponse.json({ error: "Voz inválida." }, { status: 400 });
  }

  try {
    const audio = await synthesizeNarration(PREVIEW_TEXT, voice);
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível gerar a prévia.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
