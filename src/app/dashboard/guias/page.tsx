import GuiasContent from "@/components/dashboard/guias/GuiasContent";

export default function GuiasPage() {
  return (
    <div className="mx-auto max-w-[980px]">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-white">Guias</h1>
      <p className="mt-2 max-w-[60ch] text-[15px] text-zinc-400">
        Aprenda a extrair o máximo do Virazo — do primeiro vídeo aos primeiros resultados.
      </p>

      <GuiasContent />
    </div>
  );
}
