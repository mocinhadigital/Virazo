"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function translateAuthError(message: string) {
  if (message.includes("Invalid login credentials")) {
    return "E-mail ou senha inválidos.";
  }
  if (message.includes("User already registered")) {
    return "Este e-mail já está cadastrado. Tente entrar.";
  }
  if (message.includes("Password should be at least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }
  return message;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error")
      ? "Não foi possível entrar. Tente novamente."
      : null,
  );
  const [signupSent, setSignupSent] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const isBusy = loadingGoogle || loadingEmail;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSignupSent(false);
  }

  async function handleGoogleLogin() {
    setError(null);
    setLoadingGoogle(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoadingGoogle(false);
    }
  }

  async function handleEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoadingEmail(true);

    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(translateAuthError(error.message));
        setLoadingEmail(false);
        return;
      }

      if (!data.session) {
        setSignupSent(true);
        setLoadingEmail(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(translateAuthError(error.message));
      setLoadingEmail(false);
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
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D]">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">
            Virazo
          </span>
        </Link>

        <div className="card-glass w-full max-w-sm rounded-3xl p-6 shadow-2xl shadow-black/40 sm:p-8">
          <div className="mb-6 flex rounded-full border border-white/10 bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
                mode === "signin"
                  ? "bg-white text-zinc-900"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
                mode === "signup"
                  ? "bg-white text-zinc-900"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Criar conta
            </button>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {mode === "signin" ? "Bem-vindo de volta" : "Crie sua conta"}
            </h1>
            <p className="mt-1.5 text-sm text-zinc-400">
              {mode === "signin"
                ? "Entre para continuar criando vídeos com IA"
                : "Comece a criar vídeos com IA em segundos"}
            </p>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-center text-xs font-medium text-red-400">
              {error}
            </p>
          )}

          {signupSent ? (
            <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-center text-xs font-medium text-emerald-400">
              Enviamos um link de confirmação para {email}. Verifique sua
              caixa de entrada para ativar a conta.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isBusy}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition-transform active:scale-95 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingGoogle ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleIcon className="h-4 w-4" />
                )}
                Continuar com Google
              </button>

              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-zinc-500">
                  ou {mode === "signin" ? "entre" : "cadastre-se"} com e-mail
                </span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <form onSubmit={handleEmailLogin} className="flex flex-col gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-400">
                    E-mail
                  </span>
                  <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition-colors focus-within:border-[#FF6B5B]/50">
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

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-400">
                    Senha
                  </span>
                  <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition-colors focus-within:border-[#FF6B5B]/50">
                    <Lock className="h-4 w-4 shrink-0 text-zinc-500" />
                    <input
                      type="password"
                      required
                      minLength={mode === "signup" ? 6 : undefined}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
                    />
                  </span>
                </label>

                {mode === "signin" && (
                  <div className="flex justify-end">
                    <Link
                      href="/forgot-password"
                      className="text-xs font-medium text-zinc-400 hover:text-white"
                    >
                      Esqueceu a senha?
                    </Link>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isBusy}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-4 py-3.5 text-sm font-semibold text-white shadow-xl shadow-[#FF6B5B]/25 transition-transform active:scale-95 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingEmail ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {mode === "signin" ? "Entrar" : "Criar conta"}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="relative mt-6 text-sm text-zinc-500">
          {mode === "signin" ? (
            <>
              Ainda não tem conta?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="font-medium text-zinc-300 hover:text-white"
              >
                Crie uma agora
              </button>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="font-medium text-zinc-300 hover:text-white"
              >
                Entrar
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.1 14.7 2 12 2 6.9 2 2.8 6.1 2.8 11.2S6.9 20.4 12 20.4c6.9 0 8.9-4.8 8.9-7.3 0-.5-.1-.9-.1-1.3H12z"
      />
    </svg>
  );
}
