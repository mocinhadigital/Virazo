// Aviso fixo das telas do Vídeo Realista ✨ — deixa claro que créditos e a
// duração de 60s são só dele, e não dos planos normais (Diário/Pro/Ultra).
export default function RealisticNotice({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-4 py-2.5 text-[13px] leading-snug text-amber-100 ${className}`}
    >
      <strong className="font-semibold">Vídeo Realista ✨:</strong> usa seus créditos realistas (30s = 1 crédito, 60s = 2
      créditos)
    </div>
  );
}
