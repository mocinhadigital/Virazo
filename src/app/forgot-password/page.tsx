"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Sparkles, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-[#05050a]">
      <div className="pointer-events-none absolute inset-0 bg-radial-fade" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] noise-grid" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#4C3BFF] to-[#A855F7]">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">
            Virazo
          </span>
        </Link>

        <div className="card-glass w-full max-w-sm rounded-3xl p-6 shadow-2xl shadow-black/40 sm:p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Redefinir senha
            </h1>
            <p className="mt-1.5 text-sm text-zinc-400">
              Informe seu e-mail e enviaremos um link para redefinir sua
              senha
            </p>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-center text-xs font-medium text-red-400">
              {error}
            </p>
          )}

          {sent ? (
            <p className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-center text-xs font-medium text-emerald-400">
              Se existir uma conta com o e-mail {email}, enviamos um link
              para redefinir a senha. Verifique sua caixa de entrada.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-400">
                  E-mail
                </span>
                <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition-colors focus-within:border-[#4C3BFF]/50">
                  <Mail className="h-4 w-4 shrink-0 text-zinc-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="voce@email.com"
                    className="w-full bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
                  />
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#4C3BFF] to-[#A855F7] text-[15px] font-medium text-white shadow-xl shadow-[#4C3BFF]/25 transition-transform active:scale-95 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Enviar link de redefinição"
                )}
              </button>
            </form>
          )}
        </div>

        <Link
          href="/login"
          className="relative mt-6 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para o login
        </Link>
      </div>
    </div>
  );
}
