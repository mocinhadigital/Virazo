"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import {
  computeMenuPlacement,
  DROPDOWN_MENU_CLASSNAME,
  DropdownOption,
  type MenuPlacement,
  useDropdownListNav,
} from "./dropdown-shared";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
};

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  "aria-label"?: string;
};

// Select customizado com menu em portal — o <select> nativo do navegador não
// respeita o tema escuro do app na parte do popup de opções (o Chrome/Edge
// no Windows sempre desenha fundo branco ali, deixando texto claro
// ilegível). Este componente resolve isso desenhando o menu nós mesmos.
export default function Select({ value, onChange, options, placeholder, ...aria }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<MenuPlacement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle(computeMenuPlacement(rect));
    setOpen(true);
    setActiveIndex(-1);
  }
  function closeMenu() {
    setOpen(false);
    setActiveIndex(-1);
  }

  const { activeIndex, setActiveIndex, itemRefs, handleKeyDown } = useDropdownListNav({
    open,
    itemCount: options.length,
    onSelectIndex: (i) => {
      onChange(options[i].value);
      closeMenu();
    },
    onClose: closeMenu,
    onOpen: openMenu,
  });

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    // "scroll" não borbulha, mas passa pela fase de captura em `window`: sem
    // este filtro, rolar a PRÓPRIA lista (roda, toque, scrollbar) fechava o
    // menu e impedia chegar nas últimas opções. Só fecha se a página/modal
    // rolar por trás.
    function handleScroll(e: Event) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    // No celular a barra de endereço some/volta ao rolar e dispara "resize"
    // só de altura; fechar só se a LARGURA mudar (girar a tela, redimensionar).
    const openWidth = window.innerWidth;
    function handleResize() {
      if (window.innerWidth !== openWidth) setOpen(false);
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
      <button
        type="button"
        ref={triggerRef}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={aria["aria-label"]}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left text-sm text-white focus:border-[#4C3BFF]/50 focus:outline-none"
      >
        <span className={selected ? "text-white" : "text-zinc-600"}>
          {selected?.label ?? placeholder ?? "Selecione"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        menuStyle &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: "fixed",
              top: menuStyle.top,
              bottom: menuStyle.bottom,
              left: menuStyle.left,
              width: menuStyle.width,
              maxHeight: menuStyle.maxHeight,
            }}
            className={DROPDOWN_MENU_CLASSNAME}
          >
            {options.map((option, i) => (
              <DropdownOption
                key={option.value}
                refCallback={(el) => {
                  itemRefs.current[i] = el;
                }}
                onMouseEnter={() => setActiveIndex(i)}
                label={option.label}
                description={option.description}
                isSelected={option.value === value}
                isActive={i === activeIndex}
                onClick={() => {
                  onChange(option.value);
                  closeMenu();
                }}
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
