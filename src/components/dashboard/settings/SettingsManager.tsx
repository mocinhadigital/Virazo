"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, User, Lock, Globe } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import Select from "@/components/ui/Select";
import { IDIOMA_OPTIONS } from "@/components/dashboard/series/seriesOptions";

type SaveState = "idle" | "saving" | "success" | "error";

export default function SettingsManager({
  email,
  initialFullName,
  initialPreferredLanguage,
}: {
  email: string;
  initialFullName: string;
  initialPreferredLanguage: "pt" | "en" | "es";
}) {
  return (
    <div className="flex flex-col gap-6">
      <AccountCard email={email} initialFullName={initialFullName} />
      <PasswordCard />
      <LanguageCard initialPreferredLanguage={initialPreferredLanguage} />
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-glass rounded-2xl p-4 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D]">
          <Icon className="h-4 w-4 text-white" strokeWidth={2} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-white sm:text-base">{title}</h2>
          <p className="text-xs text-zinc-500">{description}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function StatusMessage({ state, successText, errorText }: { state: SaveState; successText: string; errorText: string | null }) {
  if (state === "success") {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {successText}
      </p>
    );
  }
  if (state === "error") {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-red-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        {errorText ?? "Não foi possível salvar."}
      </p>
    );
  }
  return null;
}

function SaveButton({ state, label }: { state: SaveState; label: string }) {
  return (
    <button
      type="submit"
      disabled={state === "saving"}
      className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#FF6B5B]/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {state === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  );
}

function AccountCard({ email, initialFullName }: { email: string; initialFullName: string }) {
  const [fullName, setFullName] = useState(initialFullName);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setState("error");
      setError("Sessão expirada — recarregue a página.");
      return;
    }
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", user.id);

    if (updateError) {
      setState("error");
      setError(updateError.message);
    } else {
      setState("success");
    }
  }

  return (
    <SectionCard icon={User} title="Minha conta" description="Suas informações básicas de perfil.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-400">Nome</span>
          <input
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setState("idle");
            }}
            placeholder="Seu nome"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#FF6B5B]/50 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-400">E-mail</span>
          <input
            value={email}
            disabled
            className="w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-sm text-zinc-500"
          />
          <span className="text-[11px] text-zinc-600">
            O e-mail de login não pode ser alterado por aqui.
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <SaveButton state={state} label="Salvar alterações" />
          <StatusMessage state={state} successText="Alterações salvas." errorText={error} />
        </div>
      </form>
    </SectionCard>
  );
}

function PasswordCard() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setState("error");
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setState("error");
      setError("As senhas não coincidem.");
      return;
    }

    setState("saving");
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setState("error");
      setError(updateError.message);
    } else {
      setState("success");
      setPassword("");
      setConfirmPassword("");
    }
  }

  return (
    <SectionCard icon={Lock} title="Trocar senha" description="Defina uma nova senha para sua conta.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-400">Nova senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setState("idle");
            }}
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#FF6B5B]/50 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-400">Confirmar nova senha</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setState("idle");
            }}
            placeholder="Repita a nova senha"
            autoComplete="new-password"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#FF6B5B]/50 focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-2">
          <SaveButton state={state} label="Salvar nova senha" />
          <StatusMessage state={state} successText="Senha atualizada." errorText={error} />
        </div>
      </form>
    </SectionCard>
  );
}

function LanguageCard({ initialPreferredLanguage }: { initialPreferredLanguage: "pt" | "en" | "es" }) {
  const [language, setLanguage] = useState(initialPreferredLanguage);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setState("error");
      setError("Sessão expirada — recarregue a página.");
      return;
    }
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ preferred_language: language })
      .eq("id", user.id);

    if (updateError) {
      setState("error");
      setError(updateError.message);
    } else {
      setState("success");
    }
  }

  return (
    <SectionCard
      icon={Globe}
      title="Idioma padrão"
      description="Idioma sugerido por padrão ao criar novos vídeos e séries."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="max-w-xs">
          <Select
            value={language}
            onChange={(v) => {
              setLanguage(v as "pt" | "en" | "es");
              setState("idle");
            }}
            options={IDIOMA_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            aria-label="Idioma padrão"
          />
        </div>

        <div className="flex flex-col gap-2">
          <SaveButton state={state} label="Salvar idioma" />
          <StatusMessage state={state} successText="Preferência salva." errorText={error} />
        </div>
      </form>
    </SectionCard>
  );
}
