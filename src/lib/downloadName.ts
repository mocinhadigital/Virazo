// Nome seguro para o arquivo baixado. O título do vídeo pode ser um roteiro
// inteiro (com quebras de linha) ou ter "/" (datas das séries); nomes assim
// fazem o download falhar em alguns aparelhos/navegadores.
export function safeDownloadName(title: string | null | undefined, fallback = "video"): string {
  const cleaned = (title ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[\/:*?"<>|#%&]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.-]+$/g, "");
  let name = cleaned.length > 60 ? cleaned.slice(0, 60).replace(/\s+\S*$/, "") : cleaned;
  name = name.replace(/[\s.-]+$/, "");
  return name || fallback;
}

export function downloadHref(videoUrl: string, title: string | null | undefined, fallback = "video"): string {
  return `${videoUrl}?download=${encodeURIComponent(safeDownloadName(title, fallback))}.mp4`;
}

// Navegadores embutidos do Instagram/Facebook/TikTok costumam bloquear downloads.
export function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Bytedance/i.test(ua);
}

export function isIOS(ua: string): boolean {
  return /iPhone|iPad|iPod/i.test(ua);
}
