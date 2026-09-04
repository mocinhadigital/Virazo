"use client";

import { useState, type FormEvent } from "react";

export default function ContatoForm({ initialEmail }: { initialEmail: string }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = `Nome: ${nome}\nEmail: ${email}\n\n${mensagem}`;
    const mailto = `mailto:contato@virazo.app?subject=${encodeURIComponent(
      assunto || "Fale Conosco",
    )}&body=${encodeURIComponent(body)}`;
    window.location.assign(mailto);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 flex max-w-[620px] flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label
            className="text-[13px] font-medium uppercase text-zinc-600"
            htmlFor="contato-nome"
          >
            Nome
          </label>
          <input
            id="contato-nome"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Seu nome"
            className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 text-[15px] text-white placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none"
          />
        </div>
        <div>
          <label
            className="text-[13px] font-medium uppercase text-zinc-600"
            htmlFor="contato-email"
          >
            Email
          </label>
          <input
            id="contato-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 text-[15px] text-white placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label
          className="text-[13px] font-medium uppercase text-zinc-600"
          htmlFor="contato-assunto"
        >
          Assunto
        </label>
        <input
          id="contato-assunto"
          required
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          placeholder="Sobre o que você quer falar?"
          className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 text-[15px] text-white placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none"
        />
      </div>

      <div>
        <label
          className="text-[13px] font-medium uppercase text-zinc-600"
          htmlFor="contato-mensagem"
        >
          Mensagem
        </label>
        <textarea
          id="contato-mensagem"
          required
          rows={5}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          placeholder="Escreva sua mensagem, dúvida ou feedback..."
          className="mt-2 w-full resize-y rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 py-3 text-[15px] text-white placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none"
        />
      </div>

      <button type="submit" className="btn-primary self-start">
        Enviar mensagem
      </button>
    </form>
  );
}
