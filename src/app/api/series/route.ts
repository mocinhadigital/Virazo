import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { mapSeriesRow, type SeriesRow } from "@/components/dashboard/seriesMapping";
import { computeNextGenerationAt, HORARIO_PATTERN } from "@/lib/series/schedule";

type CreateSeriesBody = {
  title: string;
  nicho: string;
  tomDeVoz: string;
  idioma: "pt" | "en" | "es";
  visualStyle: string;
  voice: string | null;
  duration: string;
  captionsEnabled: boolean;
  captionStyle: string | null;
  backgroundMusicIds: string[];
  frequenciaDias: number;
  horario: string;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<SeriesRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map(mapSeriesRow));
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateSeriesBody;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!body.title?.trim() || !body.nicho?.trim() || !body.tomDeVoz?.trim()) {
    return NextResponse.json({ error: "Título, nicho e tom de voz são obrigatórios." }, { status: 400 });
  }
  if (!["pt", "en", "es"].includes(body.idioma)) {
    return NextResponse.json({ error: "Idioma inválido." }, { status: 400 });
  }
  if (!Number.isInteger(body.frequenciaDias) || body.frequenciaDias < 1) {
    return NextResponse.json({ error: "Frequência inválida." }, { status: 400 });
  }
  if (!HORARIO_PATTERN.test(body.horario)) {
    return NextResponse.json({ error: "Horário inválido (use HH:MM)." }, { status: 400 });
  }
  // "Heitor" existe só como opção visual/preview (ver seriesOptions.ts) — sem
  // voice_id real de TTS ainda. Bloqueado aqui pra nunca cair no fallback
  // silencioso de synthesizeNarration e gerar áudio com outra voz.
  if (body.voice === "Heitor") {
    return NextResponse.json(
      { error: "A voz \"Heitor\" ainda não está disponível para geração de vídeo." },
      { status: 400 },
    );
  }

  const musicIds = body.backgroundMusicIds ?? [];
  if (musicIds.length > 0) {
    // RLS de music_tracks já restringe a builtin + próprias do usuário — esta
    // contagem só confirma que os IDs recebidos existem e são acessíveis,
    // pra nunca gravar um id inventado/de outra pessoa em background_music_ids.
    const { count, error: musicCheckError } = await supabase
      .from("music_tracks")
      .select("id", { count: "exact", head: true })
      .in("id", musicIds);
    if (musicCheckError || count !== musicIds.length) {
      return NextResponse.json({ error: "Uma ou mais músicas selecionadas são inválidas." }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("series")
    .insert({
      user_id: user.id,
      title: body.title.trim(),
      nicho: body.nicho.trim(),
      tom_de_voz: body.tomDeVoz.trim(),
      idioma: body.idioma,
      visual_style: body.visualStyle,
      voice: body.voice,
      duration: body.duration,
      captions_enabled: body.captionsEnabled,
      caption_style: body.captionStyle,
      background_music_ids: body.backgroundMusicIds ?? [],
      frequencia_dias: body.frequenciaDias,
      horario: body.horario,
      next_generation_at: computeNextGenerationAt(body.horario),
    })
    .select("*")
    .single();
  const created = data as SeriesRow | null;

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? "Não foi possível criar a série." }, { status: 400 });
  }

  return NextResponse.json(mapSeriesRow(created));
}
