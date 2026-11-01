import LazyVideo from "./LazyVideo";

// Vídeos reais gerados pelo Virazo (public/videos-exemplo): 720p, sem áudio,
// com uma imagem de capa leve (.jpg) para a página não mostrar quadro preto.
const EXAMPLES = [
  { file: "brasil", name: "Quadrinho" },
  { file: "davi", name: "Animação 3D" },
  { file: "navio", name: "Xilogravura" },
  { file: "lugares", name: "Polaroid" },
  { file: "animal", name: "Terror" },
  { file: "mente", name: "Storytime" },
];

export default function ViralGallery() {
  return (
    <section className="pt-0 pb-10 sm:pb-14">
      <div className="mx-auto flex max-w-[1100px] flex-col items-start px-5 md:px-6">
        <h2 className="text-left text-[15px] font-semibold text-white/90">
          Nossos estilos de vídeo virais
        </h2>
        <svg
          viewBox="0 0 48 60"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="mt-2 h-11 w-11 text-white/35"
        >
          <path d="M20 8C15 24 33 30 24 48" />
          <path d="M15 40l9 9 9-9" />
        </svg>
      </div>

      {/* Celular: fileira que desliza para o lado. Telas maiores: grade. */}
      <div className="mx-auto mt-5 max-w-[1100px] px-5 md:px-6">
        <ul className="no-scrollbar -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-6">
          {EXAMPLES.map(({ file, name }) => (
            <li key={file} className="w-[44vw] max-w-[190px] shrink-0 snap-start md:w-auto md:max-w-none">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                <LazyVideo
                  src={`/videos-exemplo/${file}.mp4`}
                  poster={`/videos-exemplo/${file}.jpg`}
                  label={`Exemplo de vídeo no estilo ${name}`}
                  className="aspect-[9/16] w-full object-cover"
                />
              </div>
              <p className="mt-2 text-center text-[13px] font-medium text-white/70">{name}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
