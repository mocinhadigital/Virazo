import "server-only";
import { elevenlabs } from "./elevenlabs";

// As vozes "clássicas" da ElevenLabs (Rachel, Josh, Bella, Daniel...) são da
// Voice Library e exigem plano pago pra uso via API ("Free users cannot use
// library voices via the API"). Estas abaixo são vozes padrão atuais da
// conta, testadas com uma chamada real de text-to-speech nesta chave e
// confirmadas funcionando no plano atual.
//
// Ana/Lucas/Sofia/Marcos são os nomes ORIGINAIS (mantidos só por
// compatibilidade — séries já criadas guardam esse nome no banco e
// precisam continuar resolvendo pra o mesmo áudio). Rafael/Vicente/
// Bianca/Clara são os nomes novos, visíveis no wizard, alinhados ao
// catálogo do AutoShortz — cada um reaproveita a MESMA voice_id real de
// um dos quatro acima (não existe voz nova, só o rótulo mudou):
//   Rafael  = Marcos (George — grave e contido)
//   Vicente = Lucas  (Liam — narrador neutro/preciso)
//   Bianca  = Ana    (Alice — feminina)
//   Clara   = Sofia  (Jessica — feminina, jovem/expressiva)
// "Heitor" (a 5ª voz masculina do AutoShortz, sussurrada/terror) NÃO tem
// correspondente real testado nesta conta ElevenLabs ainda — por isso não
// aparece no wizard. Ver relato para o usuário antes de adicionar.
const VOICE_IDS: Record<string, string> = {
  Ana: "Xb7hH8MSUJpSbSDYk0k2", // Alice — feminina
  Lucas: "TX3LPaxmHKxFdv7VOQHJ", // Liam — masculina
  Sofia: "cgSgspJ2msm6clMCkdW9", // Jessica — feminina, jovem
  Marcos: "JBFqnCBsd6RMkjVDRZzb", // George — masculina, grave
  Rafael: "JBFqnCBsd6RMkjVDRZzb", // George (mesma voz de "Marcos")
  Vicente: "TX3LPaxmHKxFdv7VOQHJ", // Liam (mesma voz de "Lucas")
  Bianca: "Xb7hH8MSUJpSbSDYk0k2", // Alice (mesma voz de "Ana")
  Clara: "cgSgspJ2msm6clMCkdW9", // Jessica (mesma voz de "Sofia")
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
