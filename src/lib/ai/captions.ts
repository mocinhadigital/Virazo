import "server-only";
import { toFile } from "groq-sdk";
import { groq } from "./groq";

export type WordTiming = {
  word: string;
  start: number;
  end: number;
};

export type Transcript = {
  text: string;
  durationSeconds: number;
  words: WordTiming[];
};

// O tipo do groq-sdk só declara `{ text: string }` para a transcrição, mas a
// API (compatível com o formato Whisper/OpenAI) também devolve `duration` e
// `words` quando response_format é "verbose_json" com timestamp_granularities
// — não está refletido no .d.ts do pacote.
type VerboseTranscription = {
  text: string;
  duration?: number;
  words?: WordTiming[];
};

export async function transcribeForCaptions(
  audio: Buffer,
  filename = "narration.mp3",
  language: "pt" | "en" | "es" = "pt",
): Promise<Transcript> {
  const response = await groq.audio.transcriptions.create({
    model: "whisper-large-v3-turbo",
    file: await toFile(audio, filename),
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
    language,
  });

  const verbose = response as unknown as VerboseTranscription;
  const words = verbose.words ?? [];

  return {
    text: verbose.text,
    durationSeconds: verbose.duration ?? (words.length > 0 ? words[words.length - 1].end : 0),
    words,
  };
}
