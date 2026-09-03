"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const ACCOUNTS = [
  {
    name: "Desired.H",
    handle: "@desired.history",
    avatar: "/assets/avatars/desired-history.webp",
    screenshot: "/assets/screenshots/prova-1.webp",
    platform: "tiktok",
  },
  {
    name: "USA True Story",
    handle: "@usa.true.story",
    avatar: "/assets/avatars/usa-true-story.png",
    screenshot: "/assets/screenshots/usa-true-story.png",
    platform: "youtube",
  },
  {
    name: "Haunted Tales",
    handle: "@world.wide.story",
    avatar: "/assets/avatars/haunted-tales.png",
    screenshot: "/assets/screenshots/haunted-tales.png",
    platform: "instagram",
  },
] as const;

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82a4.28 4.28 0 0 1-3.32-3.32h-3.1v13.1a2.48 2.48 0 1 1-2.48-2.48c.2 0 .4.02.6.06V9.98a5.6 5.6 0 0 0-.6-.03A5.7 5.7 0 1 0 13.4 15.6V9.4a7.4 7.4 0 0 0 4.2 1.3V7.6a4.28 4.28 0 0 1-1-.14 4.3 4.3 0 0 1-.02-1.64z" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.5 6.19a2.78 2.78 0 0 0-1.96-1.97C18.88 3.75 12 3.75 12 3.75s-6.88 0-8.54.47A2.78 2.78 0 0 0 1.5 6.19 29 29 0 0 0 1 12a29 29 0 0 0 .5 5.81 2.78 2.78 0 0 0 1.96 1.97c1.66.47 8.54.47 8.54.47s6.88 0 8.54-.47a2.78 2.78 0 0 0 1.96-1.97A29 29 0 0 0 23 12a29 29 0 0 0-.5-5.81ZM9.75 15.5v-7L15.5 12l-5.75 3.5Z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const PLATFORM_ICON = {
  tiktok: TikTokIcon,
  youtube: YoutubeIcon,
  instagram: InstagramIcon,
} as const;

export default function RealAccounts() {
  const [index, setIndex] = useState(0);
  const account = ACCOUNTS[index];
  const PlatformIcon = PLATFORM_ICON[account.platform];

  function goPrev() {
    setIndex((i) => (i - 1 + ACCOUNTS.length) % ACCOUNTS.length);
  }
  function goNext() {
    setIndex((i) => (i + 1) % ACCOUNTS.length);
  }

  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Contas reais e virais
        </h2>
        <p className="mt-3 text-base text-zinc-400 sm:text-lg">
          Milhões de visualizações automatizadas.
        </p>

        <div className="mt-12 sm:mt-14">
          <div className="card-glass relative overflow-hidden rounded-2xl text-left">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Conta anterior"
              className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Próxima conta"
              className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={account.screenshot}
              src={account.screenshot}
              alt={`Print de vídeos com alta visualização da conta ${account.handle}`}
              className="w-full"
              loading="lazy"
            />

            <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] p-4">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={account.avatar}
                  src={account.avatar}
                  alt={account.name}
                  className="h-10 w-10 rounded-full object-cover"
                  loading="lazy"
                />
                <div>
                  <p className="text-sm font-semibold text-white">{account.name}</p>
                  <p className="text-xs text-zinc-500">{account.handle}</p>
                </div>
              </div>
              <PlatformIcon className="h-5 w-5 shrink-0 text-white" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2">
            {ACCOUNTS.map((a, i) => (
              <button
                key={a.handle}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ir para ${a.name}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-white" : "w-1.5 bg-white/25"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
