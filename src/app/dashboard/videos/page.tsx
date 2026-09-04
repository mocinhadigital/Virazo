import MeusVideos from "@/components/dashboard/MeusVideos";

export default function VideosPage() {
  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6 sm:gap-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Meus vídeos</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Todos os seus vídeos — criados manualmente ou gerados automaticamente pelas suas séries.
        </p>
      </div>

      <MeusVideos />
    </div>
  );
}
