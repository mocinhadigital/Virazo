import { Check } from "lucide-react";

// Peças visuais compartilhadas entre Select e Combobox — garante que os dois
// fiquem sempre pixel-a-pixel iguais (mesmo fundo do menu, mesmo destaque de
// selecionado, mesmo check, mesmo hover), em vez de duas classNames
// parecidas que podem divergir com o tempo.
export const DROPDOWN_MENU_CLASSNAME =
  "z-[100] max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#14141f] p-1.5 shadow-2xl shadow-black/50";

export function DropdownOption({
  label,
  description,
  isSelected,
  onClick,
}: {
  label: string;
  description?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        isSelected ? "bg-[#FF6B5B]/15 text-white" : "text-zinc-300 hover:bg-white/[0.06]"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {description && <span className="block truncate text-xs text-zinc-500">{description}</span>}
      </span>
      {isSelected && <Check className="h-4 w-4 shrink-0 text-[#FF6B5B]" />}
    </button>
  );
}
