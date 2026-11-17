import { createClient } from "@/utils/supabase/server";
import HomeChoice from "@/components/dashboard/HomeChoice";

// Tela inicial: dois caminhos claros ("um vídeo só" ou "uma série"). O criador de séries mora em
// /dashboard/series/nova.
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let seriesCount = 0;
  if (user) {
    const { count } = await supabase
      .from("series")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    seriesCount = count ?? 0;
  }

  return <HomeChoice seriesCount={seriesCount} />;
}
