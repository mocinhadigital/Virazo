// Teste de isolamento de RLS entre usuários nas tabelas novas `series` e
// `series_generation_logs` (migrations 0008/0009). Cria 2 usuários
// descartáveis, testa que um nunca lê/escreve/apaga dado do outro nem
// consegue chamar record_series_generation sobre série alheia, e no final
// apaga tudo que criou (usuários de teste incluídos). Não gera vídeo real,
// não chama nenhuma API de IA — custo zero.
//
// Uso: node scripts/test-series-rls.mjs
// Precisa que as migrations 0008, 0009 e 0010 já tenham sido rodadas no
// Supabase, e de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
// e SUPABASE_SERVICE_ROLE_KEY no .env.local.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const content = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
}
loadEnvLocal();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL_, SERVICE_KEY);

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  OK   ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}`);
    failed++;
  }
}

async function createTestUser(email) {
  const password = "Teste!12345";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`Falha ao criar usuário de teste ${email}: ${error.message}`);

  const client = createClient(URL_, ANON_KEY);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Falha ao logar usuário de teste ${email}: ${signInError.message}`);

  return { id: data.user.id, client };
}

async function main() {
  console.log("Criando usuários de teste descartáveis...");
  const userA = await createTestUser(`virazo-rls-test-a-${Date.now()}@example.com`);
  const userB = await createTestUser(`virazo-rls-test-b-${Date.now()}@example.com`);

  try {
    console.log("\n1) Usuário A cria uma série (deve funcionar)");
    const { data: seriesA, error: createErr } = await userA.client
      .from("series")
      .insert({
        user_id: userA.id,
        title: "Série de teste RLS",
        nicho: "Curiosidades",
        tom_de_voz: "Storytelling",
        visual_style: "Realista",
        duration: "30s",
        horario: "09:00:00",
      })
      .select("*")
      .single();
    check("insert da própria série funcionou", !createErr && !!seriesA);
    if (createErr) console.error("  detalhe do erro:", createErr);
    if (!seriesA) throw new Error("Não deu pra continuar sem a série de teste.");

    console.log("\n2) Usuário B tenta LER a série do usuário A (deve vir vazio, sem erro)");
    const { data: readAsB, error: readErr } = await userB.client
      .from("series")
      .select("*")
      .eq("id", seriesA.id);
    check("select de B não retorna a série de A", !readErr && (readAsB ?? []).length === 0);

    console.log("\n3) Usuário B tenta ATUALIZAR a série do usuário A (deve afetar 0 linhas)");
    const { data: updateAsB } = await userB.client
      .from("series")
      .update({ title: "Hackeado" })
      .eq("id", seriesA.id)
      .select("*");
    check("update de B não altera a série de A", (updateAsB ?? []).length === 0);

    const { data: stillSame } = await userA.client.from("series").select("title").eq("id", seriesA.id).single();
    check("título da série de A continua intacto", stillSame?.title === "Série de teste RLS");

    console.log("\n4) Usuário B tenta APAGAR a série do usuário A (deve afetar 0 linhas)");
    const { data: deleteAsB } = await userB.client.from("series").delete().eq("id", seriesA.id).select("*");
    check("delete de B não apaga a série de A", (deleteAsB ?? []).length === 0);

    console.log("\n5) Usuário B tenta chamar record_series_generation sobre a série de A (deve dar erro)");
    const { error: rpcAsBError } = await userB.client.rpc("record_series_generation", {
      p_series_id: seriesA.id,
      p_video_id: null,
      p_status: "sucesso",
      p_message: null,
    });
    check("record_series_generation rejeita série de outro usuário", !!rpcAsBError);

    console.log("\n6) Usuário A chama record_series_generation sobre a própria série (deve funcionar)");
    const { data: logA, error: rpcAsAError } = await userA.client.rpc("record_series_generation", {
      p_series_id: seriesA.id,
      p_video_id: null,
      p_status: "sucesso",
      p_message: null,
    });
    check("record_series_generation funciona para o dono", !rpcAsAError && !!logA);

    const { data: seriesAfter } = await userA.client
      .from("series")
      .select("total_videos_gerados, next_generation_at")
      .eq("id", seriesA.id)
      .single();
    check("total_videos_gerados incrementou", seriesAfter?.total_videos_gerados === 1);
    check("next_generation_at avançou", !!seriesAfter?.next_generation_at);

    console.log("\n7) Usuário B tenta LER o log de geração do usuário A (deve vir vazio)");
    const { data: logsAsB } = await userB.client
      .from("series_generation_logs")
      .select("*")
      .eq("series_id", seriesA.id);
    check("select de B não retorna logs de A", (logsAsB ?? []).length === 0);

    console.log("\n8) Usuário B tenta INSERIR direto na tabela de logs (deve dar erro — sem policy de insert)");
    const { error: insertLogAsBError } = await userB.client.from("series_generation_logs").insert({
      series_id: seriesA.id,
      user_id: userB.id,
      status: "sucesso",
    });
    check("insert direto na tabela de logs é bloqueado", !!insertLogAsBError);

    console.log("\nLimpando série de teste...");
    await userA.client.from("series").delete().eq("id", seriesA.id);
  } finally {
    console.log("\nApagando usuários de teste...");
    await admin.auth.admin.deleteUser(userA.id);
    await admin.auth.admin.deleteUser(userB.id);
  }

  console.log(`\n${passed} passaram, ${failed} falharam.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Erro no teste de RLS:", err);
  process.exit(1);
});
