"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Globe } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import Select from "@/components/ui/Select";
import { IDIOMA_OPTIONS } from "@/components/dashboard/series/seriesOptions";

type SaveState = "idle" | "saving" | "success" | "error";

export default function SettingsManager({
  email,
  initialFullName,
  initialPreferredLanguage,
  activePlanName,
  currentPeriodEnd,
}: {
  email: string;
  initialFullName: string;
  initialPreferredLanguage: "pt" | "en" | "es";
  activePlanName: string | null;
  currentPeriodEnd: string | null;
}) {
  return (
    <div className="flex flex-col">
      <section className="mt-8 rounded-card border border-white/[0.08] bg-surface p-5 md:p-6">
        <AccountFields email={email} fullName={initialFullName} />
        <div className="mt-6 border-t border-white/[0.08] pt-5">
          <PasswordFields email={email} />
        </div>
      </section>

      <section className="mt-6 rounded-card border border-white/[0.08] bg-surface p-5 md:p-6">
        <SubscriptionStatus activePlanName={activePlanName} currentPeriodEnd={currentPeriodEnd} />
      </section>

      <div className="mt-6">
        <LanguageCard initialPreferredLanguage={initialPreferredLanguage} />
      </div>
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
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#4C3BFF] to-[#A855F7]">
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
      className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#4C3BFF]/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {state === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  );
}

function AccountFields({ email, fullName }: { email: string; fullName: string }) {
  return (
    <div>
      <h2 className="text-[17px] font-semibold text-white/92">Minha conta</h2>
      <div className="mt-4 flex flex-col gap-2 text-[14px]">
        <p className="text-white/55">
          Nome: <span className="text-white/92">{fullName || "—"}</span>
        </p>
        <p className="text-white/55">
          Email: <span className="text-white/92">{email}</span>
        </p>
      </div>
    </div>
  );
}

function PasswordFields({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
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

    // Confirma a senha atual reautenticando antes de trocar — a API do
    // Supabase não aceita "senha atual" direto em updateUser, então a
    // verificação real é feita via um novo signInWithPassword.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) {
      setState("error");
      setError("Senha atual incorreta.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setState("error");
      setError(updateError.message);
    } else {
      setState("success");
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
    }
  }

  return (
    <div>
      <h3 className="text-[15px] font-semibold text-white/92">Trocar senha</h3>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value);
            setState("idle");
          }}
          placeholder="Senha atual"
          autoComplete="current-password"
          required
          className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 text-[15px] text-white/92 placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setState("idle");
          }}
          placeholder="Nova senha"
          autoComplete="new-password"
          required
          minLength={6}
          className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 text-[15px] text-white/92 placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setState("idle");
          }}
          placeholder="Confirme a nova senha"
          autoComplete="new-password"
          required
          minLength={6}
          className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 text-[15px] text-white/92 placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={state === "saving"}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#4C3BFF] to-[#A855F7] text-[15px] font-medium text-white/92 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
          Trocar senha
        </button>
        <StatusMessage state={state} successText="Senha atualizada." errorText={error} />
      </form>
    </div>
  );
}

function SubscriptionStatus({
  activePlanName,
  currentPeriodEnd,
}: {
  activePlanName: string | null;
  currentPeriodEnd: string | null;
}) {
  return (
    <div>
      <h2 className="text-[17px] font-semibold text-white/92">Assinatura</h2>
      <p className="mt-4 text-[14px] text-white/55">
        {activePlanName ? (
          <>
            Plano <span className="text-white/92">{activePlanName}</span> ativo
            {currentPeriodEnd && (
              <>
                {" "}
                — renova em{" "}
                <span className="text-white/92">
                  {new Date(currentPeriodEnd).toLocaleDateString("pt-BR")}
                </span>
              </>
            )}
            .
          </>
        ) : (
          "Você ainda não tem uma assinatura ativa."
        )}
      </p>
    </div>
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
