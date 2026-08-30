"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DROPDOWN_MENU_CLASSNAME, DropdownOption } from "./dropdown-shared";

type ComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  "aria-label"?: string;
};

// Combobox pesquisável e editável: o usuário digita livremente (o valor
// digitado É o valor do campo, sempre) e opcionalmente escolhe uma sugestão
// da lista filtrada. Menu em portal, tema escuro — nada de <select>/
// <datalist> nativo, que o navegador sempre desenha com fundo claro.
export default function Combobox({ value, onChange, options, placeholder, ...aria }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const query = value.trim().toLowerCase();
  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query))
    : options;
  const hasExactMatch = options.some((o) => o.toLowerCase() === query);

  function openMenu() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (inputRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleScrollOrResize() {
      setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={openMenu}
        onClick={openMenu}
        placeholder={placeholder}
        aria-label={aria["aria-label"]}
        autoComplete="off"
        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#FF6B5B]/50 focus:outline-none"
      />

      {open &&
        menuStyle &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ position: "fixed", top: menuStyle.top, left: menuStyle.left, width: menuStyle.width }}
            className={DROPDOWN_MENU_CLASSNAME}
          >
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-zinc-500">
                Nenhuma sugestão encontrada — seu texto será usado como nicho personalizado.
              </p>
            )}
            {filtered.map((option) => (
              <DropdownOption
                key={option}
                label={option}
                isSelected={option.toLowerCase() === query}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              />
            ))}
            {query && !hasExactMatch && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-0.5 flex w-full items-center gap-2 rounded-lg border-t border-white/[0.06] px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/[0.06]"
              >
                Usar &quot;{value.trim()}&quot; como nicho personalizado
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
