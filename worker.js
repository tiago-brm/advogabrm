import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

// ============================================================
// RPA Worker — Hiperautomação (Patch 008)
// ============================================================

// --- Robôs disponíveis -----------------------------------------
// Cada robô recebe o rpa_payload e deve retornar um objeto com
// o resultado, ou lançar um Error em caso de falha.
// Adicione novos robôs aqui conforme forem implementados.
// ---------------------------------------------------------------

async function robot_emissor_guia_tjms(payload) {
  // TODO: implementar com Playwright
  // const { chromium } = await import('playwright');
  // const browser = await chromium.launch();
  // ...
  console.log(`  [RPA] emissor_guia_tjms | payload:`, payload);
  throw new Error("Robô ainda não implementado — substitua este stub pelo Playwright.");
}

async function robot_triagem_datajud(payload) {
  const { numero, tribunal } = payload;
  if (!numero || !tribunal) throw new Error("Payload inválido: faltam 'numero' e 'tribunal'.");

  const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${tribunal}/_search`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.DATAJUD_API_KEY || "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==",
    },
    body: JSON.stringify({
      query: { match: { numeroProcesso: numero } },
      size: 1,
    }),
  });

  if (!res.ok) throw new Error(`DataJud retornou ${res.status}`);
  const json = await res.json();
  const hit = json?.hits?.hits?.[0]?._source ?? null;
  if (!hit) throw new Error(`Processo ${numero} não encontrado no DataJud.`);

  return {
    numeroProcesso: hit.numeroProcesso,
    classe:         hit.classe?.nome,
    assunto:        hit.assuntos?.[0]?.nome,
    situacao:       hit.situacao?.nome,
    tribunal:       hit.tribunal?.nome,
    valor_causa:    hit.valorCausa,
    partes:         hit.partes ?? [],
  };
}

// Registro de robôs — chave = rpa_queue
const ROBOTS = {
  emissor_guia_tjms: robot_emissor_guia_tjms,
  triagem_datajud:   robot_triagem_datajud,
};

// --- Funções de ciclo de vida da task --------------------------

async function claimRpaTask(supabase, queue) {
  const { data, error } = await supabase.rpc("claim_rpa_task", { p_queue: queue });
  if (error) throw new Error(`claim_rpa_task falhou: ${error.message}`);
  return data?.[0] ?? null; // retorna { id, rpa_payload } ou null
}

async function markCompleted(supabase, taskId, result) {
  const { error } = await supabase
    .from("tasks")
    .update({ status: "COMPLETED", rpa_result: result, completed_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) throw new Error(`markCompleted falhou: ${error.message}`);
}

async function markFailed(supabase, taskId, errorMsg) {
  const { error } = await supabase
    .from("tasks")
    .update({ status: "FAILED", error_message: errorMsg })
    .eq("id", taskId);
  if (error) console.error(`  [RPA] Falha ao registrar erro no banco: ${error.message}`);
}

// --- Loop de polling -------------------------------------------

async function pollRpaTasks(supabase) {
  for (const queue of Object.keys(ROBOTS)) {
    let task = null;
    try {
      task = await claimRpaTask(supabase, queue);
    } catch (err) {
      console.error(`[RPA] Erro no claim da fila '${queue}': ${err.message}`);
      continue;
    }

    if (!task) continue;

    console.log(`[RPA] ⚙️  Task ${task.id} | fila: ${queue}`);

    try {
      const result = await ROBOTS[queue](task.rpa_payload ?? {});
      await markCompleted(supabase, task.id, result);
      console.log(`[RPA] ✅ Task ${task.id} concluída.`);
    } catch (err) {
      await markFailed(supabase, task.id, err.message);
      console.error(`[RPA] ❌ Task ${task.id} falhou: ${err.message}`);
    }
  }
}

// Configurações do Supabase — use variáveis sem prefixo VITE_ no worker (server-side)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATAJUD_API_KEY_PUBLIC = process.env.DATAJUD_API_KEY || "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ FATAL: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias. NUNCA use ANON_KEY no worker.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function buildDataJudUrl(alias) {
  return `https://api-publica.datajud.cnj.jus.br/api_publica_${alias}/_search`;
}

async function processarAgendamentos() {
  console.log(`[${new Date().toLocaleString()}] 🔄 Verificando agendamentos pendentes...`);

  try {
    const { data: agendamentos, error: agendamentosErr } = await supabase
      .from("agendamentos_buscas")
      .select("*, profiles(email)")
      .eq("status", "Ativo")
      .lte("proxima_execucao", new Date().toISOString());

    if (agendamentosErr) throw agendamentosErr;

    if (!agendamentos || agendamentos.length === 0) {
      console.log("Nenhum agendamento pendente.");
      return;
    }

    console.log(`Encontrados ${agendamentos.length} agendamento(s) para processar.`);

    for (const ag of agendamentos) {
      console.log(`-> Processando Busca do Tribunal: ${ag.tribunal} | Usuário: ${ag.user_id}`);

      try {
        const queryParts = [];
        if (ag.data_ajuizamento_inicio || ag.data_ajuizamento_fim) {
          const range = {};
          if (ag.data_ajuizamento_inicio) {
            range.gte = `${ag.data_ajuizamento_inicio.replace(/-/g, "")}000000`;
          }
          if (ag.data_ajuizamento_fim) {
            range.lte = `${ag.data_ajuizamento_fim.replace(/-/g, "")}235959`;
          }
          queryParts.push({ range: { dataAjuizamento: range } });
        }
        if (ag.assunto) {
          queryParts.push({ match: { "assuntos.nome": ag.assunto } });
        }

        const body = {
          query: queryParts.length > 0 ? { bool: { must: queryParts } } : { match_all: {} },
          size: 50,
          sort: [{ dataAjuizamento: { order: "desc" } }]
        };

        const djRes = await fetch(buildDataJudUrl(ag.tribunal), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": DATAJUD_API_KEY_PUBLIC
          },
          body: JSON.stringify(body)
        });

        if (!djRes.ok) throw new Error(`DataJud API Erro: ${djRes.status}`);
        const djData = await djRes.json();
        const hits = djData?.hits?.hits ?? [];
        const total = djData?.hits?.total?.value ?? hits.length;

        if (ag.enviar_email) {
          const { data: smtp } = await supabase
            .from("user_smtp_configs")
            .select("*")
            .eq("user_id", ag.user_id)
            .single();

          if (smtp) {
            const transporter = nodemailer.createTransport({
              host: smtp.host,
              port: smtp.port,
              secure: smtp.secure,
              auth: {
                user: smtp.username,
                pass: smtp.password,
              },
            });

            let htmlResultados = hits.map((h) => {
              const p = h._source;
              return `<li><strong>${p.numeroProcesso}</strong> - ${p.classe?.nome || p.classe} (${p.dataAjuizamento ? new Date(p.dataAjuizamento).toLocaleDateString("pt-BR") : ""})</li>`;
            }).join("");

            const html = `
              <h2>Relatório Automático de Processos - AdvogaBRM</h2>
              <p>Olá, sua busca programada no tribunal <strong>${ag.tribunal.toUpperCase()}</strong> foi executada.</p>
              <p><strong>Total Encontrado:</strong> ${total}</p>
              <ul>${htmlResultados || "<li>Nenhum processo novo encontrado.</li>"}</ul>
              <br/>
              <p>Acesse o sistema AdvogaBRM para ver todos os detalhes.</p>
            `;

            await transporter.sendMail({
              from: `"${smtp.from_name}" <${smtp.from_email}>`,
              to: ag.profiles.email,
              subject: `Resultados da Busca: ${ag.tribunal.toUpperCase()}`,
              html: html,
            });
            console.log("✅ Email enviado com sucesso para", ag.profiles.email);
          } else {
            console.warn("⚠️ Usuário não possui SMTP configurado. Pulando e-mail.");
          }
        }

        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + (ag.frequencia_dias || 1));

        await supabase
          .from("agendamentos_buscas")
          .update({
            ultima_execucao: new Date().toISOString(),
            proxima_execucao: nextDate.toISOString()
          })
          .eq("id", ag.id);

      } catch (err) {
        console.error(`❌ Falha no agendamento ${ag.id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error("❌ Erro fatal no worker:", err);
  }
}

// ============================================================
// Alertas Automáticos — prazos, vencimentos e inatividade
// ============================================================

async function enviarEmailAlerta(smtp, para, assunto, html) {
  const transporter = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.secure,
    auth: { user: smtp.username, pass: smtp.password },
  });
  await transporter.sendMail({
    from: `"${smtp.from_name}" <${smtp.from_email}>`,
    to: para,
    subject: assunto,
    html,
  });
}

async function verificarAlertas() {
  console.log(`[${new Date().toLocaleString()}] 🔔 Verificando alertas automáticos...`);

  // Busca todos os usuários com SMTP configurado
  const { data: smtpConfigs } = await supabase
    .from("user_smtp_configs")
    .select("user_id, host, port, secure, username, password, from_name, from_email");

  if (!smtpConfigs?.length) return;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  for (const smtp of smtpConfigs) {
    const uid = smtp.user_id;

    // Busca e-mail do usuário
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", uid)
      .single();
    if (!profile?.email) continue;

    const alertas = [];

    // ── 1. Processos com prazo vencendo em até 3 dias ──────────
    const prazoLimite = new Date(hoje);
    prazoLimite.setDate(prazoLimite.getDate() + 3);

    const { data: processosPrazo } = await supabase
      .from("processos")
      .select("numero, assunto, data_limite, responsavel")
      .eq("user_id", uid)
      .eq("status", "Em Andamento")
      .not("data_limite", "is", null)
      .gte("data_limite", hoje.toISOString().split("T")[0])
      .lte("data_limite", prazoLimite.toISOString().split("T")[0]);

    if (processosPrazo?.length) {
      alertas.push({
        titulo: `⚖️ ${processosPrazo.length} processo(s) com prazo nos próximos 3 dias`,
        itens: processosPrazo.map((p) =>
          `<li><strong>${p.numero}</strong> — ${p.assunto} | Prazo: <strong>${new Date(p.data_limite + "T00:00:00").toLocaleDateString("pt-BR")}</strong> | Resp.: ${p.responsavel || "—"}</li>`
        ).join(""),
      });
    }

    // ── 2. Lançamentos vencendo em até 3 dias ─────────────────
    const { data: lancamentos } = await supabase
      .from("financeiro_lancamentos")
      .select("descricao, valor, data_vencimento, cliente_id")
      .eq("user_id", uid)
      .eq("status", "Pendente")
      .gte("data_vencimento", hoje.toISOString().split("T")[0])
      .lte("data_vencimento", prazoLimite.toISOString().split("T")[0]);

    if (lancamentos?.length) {
      const total = lancamentos.reduce((s, l) => s + Number(l.valor), 0);
      alertas.push({
        titulo: `💰 ${lancamentos.length} lançamento(s) vencendo nos próximos 3 dias (R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`,
        itens: lancamentos.map((l) =>
          `<li>${l.descricao} | Vence: <strong>${new Date(l.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}</strong> | R$ ${Number(l.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</li>`
        ).join(""),
      });
    }

    // ── 3. Processos sem movimentação há 30+ dias ─────────────
    const inativoDesde = new Date(hoje);
    inativoDesde.setDate(inativoDesde.getDate() - 30);

    const { data: processosInativos } = await supabase
      .from("processos")
      .select("numero, assunto, updated_at, responsavel")
      .eq("user_id", uid)
      .eq("status", "Em Andamento")
      .lte("updated_at", inativoDesde.toISOString());

    if (processosInativos?.length) {
      alertas.push({
        titulo: `⏸️ ${processosInativos.length} processo(s) sem movimentação há mais de 30 dias`,
        itens: processosInativos.map((p) =>
          `<li><strong>${p.numero}</strong> — ${p.assunto} | Última atualização: ${new Date(p.updated_at).toLocaleDateString("pt-BR")}</li>`
        ).join(""),
      });
    }

    if (!alertas.length) continue;

    const blocos = alertas.map((a) =>
      `<h3 style="color:#1a1a2e;margin-top:20px">${a.titulo}</h3><ul>${a.itens}</ul>`
    ).join("");

    const html = `
      <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
        <h2 style="color:#1a1a2e">🔔 Resumo de Alertas — AdvogaBRM</h2>
        <p>Olá! Aqui estão os alertas automáticos do dia <strong>${hoje.toLocaleDateString("pt-BR")}</strong>:</p>
        ${blocos}
        <hr style="margin-top:32px"/>
        <p style="font-size:12px;color:#666">Acesse o sistema para visualizar os detalhes e tomar as ações necessárias.</p>
      </div>`;

    try {
      await enviarEmailAlerta(smtp, profile.email, `🔔 Alertas do dia ${hoje.toLocaleDateString("pt-BR")} — AdvogaBRM`, html);
      console.log(`  ✅ Alerta enviado para ${profile.email} (${alertas.length} bloco(s))`);
    } catch (err) {
      console.error(`  ❌ Erro ao enviar alerta para ${profile.email}: ${err.message}`);
    }
  }
}

// --- Agendamentos (cron existente) ----------------------------
console.log("🚀 AdvogaBRM Worker iniciado.");
console.log("   → Agendamentos DataJud/Email: a cada hora");
console.log("   → Alertas automáticos: diário às 08:00");
console.log("   → RPA Task Polling: a cada 5 segundos");

cron.schedule("0 * * * *", processarAgendamentos);
processarAgendamentos(); // roda imediatamente ao iniciar

cron.schedule("0 8 * * *", verificarAlertas);
verificarAlertas(); // roda imediatamente ao iniciar

// --- RPA Polling ----------------------------------------------
// Usa setInterval pois cron não suporta intervalos < 1 minuto.
const RPA_POLL_MS = 5_000;
setInterval(() => pollRpaTasks(supabase), RPA_POLL_MS);
pollRpaTasks(supabase); // dispara imediatamente ao iniciar
