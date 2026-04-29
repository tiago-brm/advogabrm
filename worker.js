import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

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

// Roda a cada 1 hora
console.log("🚀 AdvogaBRM Worker iniciado. Checando agendamentos de hora em hora...");
cron.schedule("0 * * * *", processarAgendamentos);

// Também roda imediatamente ao ligar o script para testarmos!
processarAgendamentos();
