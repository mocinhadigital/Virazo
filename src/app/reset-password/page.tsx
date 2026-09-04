"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Sparkles, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(
        error.message.includes("session")
          ? "Este link expirou ou já foi usado. Solicite um novo link."
          : error.message,
      );
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
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
              Escolha uma nova senha
            </h1>
            <p className="mt-1.5 text-sm text-zinc-400">
              Sua nova senha deve ter pelo menos 6 caracteres
            </p>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-center text-xs font-medium text-red-400">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-400">
                Nova senha
              </span>
              <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition-colors focus-within:border-[#4C3BFF]/50">
                <Lock className="h-4 w-4 shrink-0 text-zinc-500" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-400">
                Confirmar nova senha
              </span>
              <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition-colors focus-within:border-[#4C3BFF]/50">
                <Lock className="h-4 w-4 shrink-0 text-zinc-500" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
                />
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-4 py-3.5 text-sm font-semibold text-white shadow-xl shadow-[#4C3BFF]/25 transition-transform active:scale-95 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Salvar nova senha"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
