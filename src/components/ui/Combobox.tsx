"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DROPDOWN_MENU_CLASSNAME, DropdownOption, NO_BROWSER_AUTOFILL_PROPS, useDropdownListNav } from "./dropdown-shared";

type ComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  "aria-label"?: string;
};

// Combobox pesquisável e editável: o usuário digita livremente (o valor
// digitado É o valor do campo, sempre) e opcionalmente escolhe uma sugestão
// da lista filtrada. Menu em portal, tema escuro, mesmas peças visuais do
// Select (ver dropdown-shared.tsx) — nada de <select>/<datalist> nativo.
export default function Combobox({ value, onChange, options, placeholder, ...aria }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const query = value.trim().toLowerCase();
  const filtered = query ? options.filter((o) => o.toLowerCase().includes(query)) : options;
  const hasExactMatch = options.some((o) => o.toLowerCase() === query);

  function openMenu() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    setOpen(true);
    setActiveIndex(-1);
  }
  function closeMenu() {
    setOpen(false);
    setActiveIndex(-1);
  }

  const { activeIndex, setActiveIndex, itemRefs, handleKeyDown } = useDropdownListNav({
    open,
    itemCount: filtered.length,
    onSelectIndex: (i) => {
      onChange(filtered[i]);
      closeMenu();
    },
    onClose: closeMenu,
    onOpen: openMenu,
  });

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (inputRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    // "scroll" não borbulha (bubbles: false), mas ainda passa pela fase de
    // captura por todos os ancestrais — inclusive `window`. Sem o filtro por
    // `target` abaixo, todo scroll DENTRO da própria lista (roda do mouse,
    // touchpad, arrastar a scrollbar) também disparava este listener e
    // fechava o menu na hora, o que impedia rolar até o fim da lista.
    function handleScroll(e: Event) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleResize() {
      setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open]);

  return (
    <>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) openMenu();
        }}
        onFocus={openMenu}
        onClick={openMenu}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={aria["aria-label"]}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        {...NO_BROWSER_AUTOFILL_PROPS}
        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#FF6B5B]/50 focus:outline-none"
      />

      {open &&
        menuStyle &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            style={{ position: "fixed", top: menuStyle.top, left: menuStyle.left, width: menuStyle.width }}
            className={DROPDOWN_MENU_CLASSNAME}
          >
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-zinc-500">
                Nenhuma sugestão encontrada — seu texto será usado como nicho personalizado.
              </p>
            )}
            {filtered.map((option, i) => (
              <DropdownOption
                key={option}
                refCallback={(el) => {
                  itemRefs.current[i] = el;
                }}
                onMouseEnter={() => setActiveIndex(i)}
                label={option}
                isSelected={option.toLowerCase() === query}
                isActive={i === activeIndex}
                onClick={() => {
                  onChange(option);
                  closeMenu();
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
