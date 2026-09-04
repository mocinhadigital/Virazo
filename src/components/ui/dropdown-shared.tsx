import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";

// Peças e comportamento compartilhados entre Select e Combobox — garante que
// os dois fiquem sempre pixel-a-pixel iguais (mesmo fundo do menu, mesmo
// destaque de selecionado, mesmo check, mesmo hover, mesma navegação por
// teclado), em vez de duas implementações parecidas que podem divergir.
export const DROPDOWN_MENU_CLASSNAME =
  "z-[100] max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#14141f] p-1.5 shadow-2xl shadow-black/50";

export function DropdownOption({
  label,
  description,
  isSelected,
  isActive,
  onClick,
  onMouseEnter,
  refCallback,
}: {
  label: string;
  description?: string;
  isSelected: boolean;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  refCallback?: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={refCallback}
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        isSelected
          ? "bg-[#4C3BFF]/15 text-white"
          : isActive
            ? "bg-white/[0.06] text-white"
            : "text-zinc-300 hover:bg-white/[0.06]"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {description && <span className="block truncate text-xs text-zinc-500">{description}</span>}
      </span>
      {isSelected && <Check className="h-4 w-4 shrink-0 text-[#4C3BFF]" />}
    </button>
  );
}

// Atributos que impedem o navegador e extensões de gerenciador de senha
// (LastPass, 1Password, Bitwarden, Dashlane...) de desenhar o próprio popup
// de sugestões por cima de um <input> de texto comum. Botões nunca sofrem
// disso — só inputs — por isso só o Combobox precisa disto.
export const NO_BROWSER_AUTOFILL_PROPS = {
  autoComplete: "off",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

// Navegação por teclado compartilhada: ↑/↓, Home/End, PageUp/PageDown,
// Enter e Escape — com scrollIntoView pra manter a opção ativa visível.
export function useDropdownListNav({
  open,
  itemCount,
  onSelectIndex,
  onClose,
  onOpen,
}: {
  open: boolean;
  itemCount: number;
  onSelectIndex: (index: number) => void;
  onClose: () => void;
  onOpen: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (activeIndex < 0) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, itemCount);
  }, [itemCount]);

  function handleKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        onOpen();
      }
      return;
    }
    if (itemCount === 0) {
      if (e.key === "Escape") onClose();
      return;
    }
    const clamp = (i: number) => Math.max(0, Math.min(itemCount - 1, i));
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => clamp(i < 0 ? 0 : i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => clamp(i < 0 ? itemCount - 1 : i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(itemCount - 1);
        break;
      case "PageDown":
        e.preventDefault();
        setActiveIndex((i) => clamp((i < 0 ? 0 : i) + 5));
        break;
      case "PageUp":
        e.preventDefault();
        setActiveIndex((i) => clamp((i < 0 ? 0 : i) - 5));
        break;
      case "Enter":
        if (activeIndex >= 0) {
          e.preventDefault();
          onSelectIndex(activeIndex);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }

  return { activeIndex, setActiveIndex, itemRefs, handleKeyDown };
}
