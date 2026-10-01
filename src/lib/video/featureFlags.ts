import "server-only";

// Ver src/lib/video/durations.ts.
export function areLongVideosEnabled(): boolean {
  return process.env.LONG_VIDEOS_ENABLED?.trim().toLowerCase() === "true";
}
