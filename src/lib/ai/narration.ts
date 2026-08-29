import "server-only";
import { elevenlabs } from "./elevenlabs";

// As vozes "clássicas" da ElevenLabs (Rachel, Josh, Bella, Daniel...) são da
// Voice Library e exigem plano pago pra uso via API ("Free users cannot use
// library voices via the API"). Estas abaixo são vozes padrão atuais da
// conta, testadas com uma chamada real de text-to-speech nesta chave e
// confirmadas funcionando no plano atual.
const VOICE_IDS: Record<string, string> = {
  Ana: "Xb7hH8MSUJpSbSDYk0k2", // Alice — feminina
  Lucas: "TX3LPaxmHKxFdv7VOQHJ", // Liam — masculina
  Sofia: "cgSgspJ2msm6clMCkdW9", // Jessica — feminina, jovem
  Marcos: "JBFqnCBsd6RMkjVDRZzb", // George — masculina, grave
};

export async function synthesizeNarration(text: string, voiceName: string): Promise<Buffer> {
  const voiceId = VOICE_IDS[voiceName] ?? VOICE_IDS.Ana;

  const stream = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    modelId: "eleven_multilingual_v2",
  });

  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}
