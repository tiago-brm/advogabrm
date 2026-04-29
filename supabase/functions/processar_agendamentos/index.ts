import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import * as nodemailer from "https://esm.sh/nodemailer@6.9.9";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WORKER_SECRET = Deno.env.get("WORKER_SECRET") ?? "";
const DATAJUD_API_KEY_PUBLIC = Deno.env.get("DATAJUD_API_KEY") ?? "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function buildDataJudUrl(alias: string) {
  return `https://api-publica.datajud.cnj.jus.br/api_publica_${alias}/_search`;
}

serve(async (req) => {
  // [HIGH-02] FIX: Verificar secret interno para impedir chamadas externas
  const incomingSecret = req.headers.get("x-internal-secret");
  if (!WORKER_SECRET || incomingSecret !== WORKER_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // 1. Buscar agendamentos pendentes
    const { data: agendamentos, error: agendamentosErr } = await supabase
      .from("agendamentos_buscas")
      .select("*, profiles(email, full_name)")
      .eq("status", "Ativo")
      .lte("proxima_execucao", new Date().toISOString());

    if (agendamentosErr) throw agendamentosErr;
    if (!agendamentos || agendamentos.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhum agendamento pendente." }), { status: 200 });
    }

    let processados = 0;

    for (const ag of agendamentos) {
      console.log(`Processando agendamento ${ag.id} do user ${ag.user_id}`);

      try {
        // 2. Montar query do DataJud
        const queryParts: any[] = [];
        if (ag.data_ajuizamento_inicio || ag.data_ajuizamento_fim) {
          const range: any = {};
          if (ag.data_ajuizamento_inicio) {
            const d = ag.data_ajuizamento_inicio.replace(/-/g, "");
            range.gte = `${d}000000`;
          }
          if (ag.data_ajuizamento_fim) {
            const d = ag.data_ajuizamento_fim.replace(/-/g, "");
            range.lte = `${d}235959`;
          }
          queryParts.push({ range: { dataAjuizamento: range } });
        }
        if (ag.assunto) {
          queryParts.push({ match: { "assuntos.nome": ag.assunto } });
        }

        const body = {
          query: queryParts.length > 0 ? { bool: { must: queryParts } } : { match_all: {} },
          size: 50, // Limite pro e-mail pra não estourar tamanho
          sort: [{ dataAjuizamento: { order: "desc" } }]
        };

        // Chamar DataJud
        const djRes = await fetch(buildDataJudUrl(ag.tribunal), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": DATAJUD_API_KEY_PUBLIC
          },
          body: JSON.stringify(body)
        });

        if (!djRes.ok) throw new Error(`Erro API Datajud: ${djRes.status}`);
        const djData = await djRes.json();
        const hits = djData?.hits?.hits ?? [];
        const total = djData?.hits?.total?.value ?? hits.length;

        // 3. Enviar email se marcado
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

            // Montar HTML do e-mail
            let htmlResultados = hits.map((h: any) => {
              const p = h._source;
              return `<li><strong>${p.numeroProcesso}</strong> - ${p.classe?.nome || p.classe} (${p.dataAjuizamento ? new Date(p.dataAjuizamento).toLocaleDateString("pt-BR") : ""})</li>`;
            }).join("");

            const html = `
              <h2>Relatório Automático de Processos - Advoga PRO</h2>
              <p>Olá, sua busca programada no tribunal <strong>${ag.tribunal.toUpperCase()}</strong> foi executada.</p>
              <p>Filtros: Assunto = ${ag.assunto || "Qualquer"}, Período = ${ag.data_ajuizamento_inicio || "*"} a ${ag.data_ajuizamento_fim || "*"}</p>
              <p><strong>Total Encontrado:</strong> ${total}</p>
              <ul>${htmlResultados || "<li>Nenhum processo novo encontrado.</li>"}</ul>
              <br/>
              <p>Acesse o sistema Advoga PRO para ver todos os detalhes.</p>
            `;

            await transporter.sendMail({
              from: `"${smtp.from_name}" <${smtp.from_email}>`,
              to: ag.profiles.email,
              subject: `Resultados da Busca: ${ag.tribunal.toUpperCase()}`,
              html: html,
            });
            console.log("Email enviado com sucesso.");
          } else {
            console.warn("Usuário não possui SMTP configurado, pulando email.");
          }
        }

        // 4. Atualizar o agendamento para a próxima rodada
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + (ag.frequencia_dias || 1));

        await supabase
          .from("agendamentos_buscas")
          .update({
            ultima_execucao: new Date().toISOString(),
            proxima_execucao: nextDate.toISOString()
          })
          .eq("id", ag.id);

        processados++;

      } catch (err: any) {
        console.error(`Falha no agendamento ${ag.id}: ${err.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, processados }), { status: 200 });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
