// Qual vídeo da página inicial está com som agora (no máximo UM). Todos os
// vídeos começam mudos; ligar o som de um desliga o do outro. Guardado fora
// do React para os 7 vídeos (hero + galeria) enxergarem o mesmo valor.

let activeId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveSoundId(): string | null {
  return activeId;
}

// Toca no botão: liga o som deste vídeo (e portanto desliga o de qualquer
// outro) ou, se já estava ligado, desliga. Devolve se ficou com som.
export function toggleSound(id: string): boolean {
  activeId = activeId === id ? null : id;
  emit();
  return activeId === id;
}

// O vídeo saiu da tela: se era o que estava com som, volta a ficar mudo.
export function releaseSound(id: string): void {
  if (activeId !== id) return;
  activeId = null;
  emit();
}
