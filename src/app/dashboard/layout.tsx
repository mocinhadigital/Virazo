import { redirect } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import TopBar from "@/components/dashboard/TopBar";
import MobileNav from "@/components/dashboard/MobileNav";
import CreateVideoWizard from "@/components/dashboard/CreateVideoWizard";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { mapVideoRow, type VideoRow } from "@/components/dashboard/videoMapping";
import { createClient } from "@/utils/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile, error: profileError }, { data: videoRows, error: videosError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("credits, full_name")
        .eq("id", user.id)
        .maybeSingle()
        .returns<{ credits: number; full_name: string | null }>(),
      supabase
        .from("videos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .returns<VideoRow[]>(),
    ]);

  if (profileError) console.error("Falha ao carregar perfil:", profileError.message);
  if (videosError) console.error("Falha ao carregar vídeos:", videosError.message);

  const initialCredits = profile?.credits ?? 0;
  const initialVideos = (videoRows ?? []).map(mapVideoRow);
  const displayName = profile?.full_name?.trim() || user.email?.split("@")[0] || "Usuário";

  return (
    <DashboardProvider initialCredits={initialCredits} initialVideos={initialVideos}>
      <div className="min-h-screen bg-[#05050a]">
        <Sidebar userName={displayName} />
        <div className="flex min-h-screen flex-col lg:pl-64">
          <TopBar />
          <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10">
            {children}
          </main>
        </div>
        <MobileNav />
      </div>
      <CreateVideoWizard />
    </DashboardProvider>
  );
}
