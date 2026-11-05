import { after, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { advanceRealisticVideo, advanceSecret } from "@/lib/realistic/advance";

export const runtime = "nodejs";
export const maxDuration = 300;

// Passagem de bastão da geração em etapas (ver src/lib/realistic/advance.ts):
// uma chamada que esgotou o seu tempo chama esta rota para continuar de onde
// parou. Só o próprio servidor conhece o segredo; sem ele, 401.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (request.headers.get("x-realistic-secret") !== advanceSecret()) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const service = createServiceRoleClient();
  // Responde na hora; o trabalho segue depois da resposta, com o prazo cheio.
  after(async () => {
    await advanceRealisticVideo(service, id, origin);
  });
  return NextResponse.json({ ok: true });
}
