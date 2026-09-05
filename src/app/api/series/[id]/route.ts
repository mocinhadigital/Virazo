import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { mapSeriesRow, type SeriesRow } from "@/components/dashboard/seriesMapping";
import { computeNextGenerationAt, HORARIO_PATTERN } from "@/lib/series/schedule";

type UpdateSeriesBody = Partial<{
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
  status: "ativa" | "pausada" | "arquivada";
}>;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as UpdateSeriesBody;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: existingData, error: existingError } = await supabase
    .from("series")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const existing = existingData as SeriesRow | null;

  if (existingError || !existing) {
    return NextResponse.json({ error: "Série não encontrada." }, { status: 404 });
  }

  if (body.idioma !== undefined && !["pt", "en", "es"].includes(body.idioma)) {
    return NextResponse.json({ error: "Idioma inválido." }, { status: 400 });
  }
  if (body.frequenciaDias !== undefined && (!Number.isInteger(body.frequenciaDias) || body.frequenciaDias < 1)) {
    return NextResponse.json({ error: "Frequência inválida." }, { status: 400 });
  }
  if (body.horario !== undefined && !HORARIO_PATTERN.test(body.horario)) {
    return NextResponse.json({ error: "Horário inválido (use HH:MM)." }, { status: 400 });
  }
  // Mesmo bloqueio de src/app/api/series/route.ts: "Heitor" é só preview,
  // sem voice_id real — nunca deixar cair no fallback silencioso de vozes.
  if (body.voice === "Heitor") {
    return NextResponse.json(
      { error: "A voz \"Heitor\" ainda não está disponível para geração de vídeo." },
      { status: 400 },
    );
  }
  if (body.backgroundMusicIds !== undefined && body.backgroundMusicIds.length > 0) {
    const { count, error: musicCheckError } = await supabase
      .from("music_tracks")
      .select("id", { count: "exact", head: true })
      .in("id", body.backgroundMusicIds);
    if (musicCheckError || count !== body.backgroundMusicIds.length) {
      return NextResponse.json({ error: "Uma ou mais músicas selecionadas são inválidas." }, { status: 400 });
    }
  }

  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title.trim();
  if (body.nicho !== undefined) update.nicho = body.nicho.trim();
  if (body.tomDeVoz !== undefined) update.tom_de_voz = body.tomDeVoz.trim();
  if (body.idioma !== undefined) update.idioma = body.idioma;
  if (body.visualStyle !== undefined) update.visual_style = body.visualStyle;
  if (body.voice !== undefined) update.voice = body.voice;
  if (body.duration !== undefined) update.duration = body.duration;
  if (body.captionsEnabled !== undefined) update.captions_enabled = body.captionsEnabled;
  if (body.captionStyle !== undefined) update.caption_style = body.captionStyle;
  if (body.backgroundMusicIds !== undefined) update.background_music_ids = body.backgroundMusicIds;
  if (body.frequenciaDias !== undefined) update.frequencia_dias = body.frequenciaDias;
  if (body.horario !== undefined) update.horario = body.horario;
  if (body.status !== undefined) update.status = body.status;

  // Reagenda a próxima geração quando o horário muda, ou quando a série sai
  // de "pausada"/"arquivada" de volta para "ativa" — evita disparar
  // imediatamente com uma data antiga que ficou parada durante a pausa.
  const reactivating = body.status === "ativa" && existing.status !== "ativa";
  if (body.horario !== undefined || reactivating) {
    const horario = body.horario ?? existing.horario;
    update.next_generation_at = computeNextGenerationAt(horario);
  }

  const { data, error } = await supabase
    .from("series")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  const updated = data as SeriesRow | null;

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Não foi possível atualizar a série." }, { status: 400 });
  }

  return NextResponse.json(mapSeriesRow(updated));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { error } = await supabase.from("series").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
