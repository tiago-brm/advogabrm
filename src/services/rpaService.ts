// ─── Tipos da API RPA ─────────────────────────────────────────────────────────

// Usa o proxy do Vite para evitar CORS (/rpa-api → https://khol-rpa.ymlwkl.easypanel.host)
const RPA_API_BASE = "/rpa-api";

export const RPA_TRIBUNAIS_SUPORTADOS = ["tjms", "tjsp", "tjmt"];

// ─── Formatter CNJ ────────────────────────────────────────────────────────────
// A API RPA espera o número no formato com pontuação: NNNNNNN-DD.AAAA.J.TT.OOOO
// O DataJud retorna em formato raw de 20 dígitos (ex: 00008323520184013202)
export function formatarNumeroCNJ(numero: string): string {
  const s = numero.replace(/\D/g, "");
  if (s.length === 20) {
    // 7-2.4.1.2.4
    return `${s.slice(0,7)}-${s.slice(7,9)}.${s.slice(9,13)}.${s.slice(13,14)}.${s.slice(14,16)}.${s.slice(16,20)}`;
  }
  return numero; // já está formatado ou formato desconhecido
}

export interface ResultadoRPA {
  numero_processo: string;
  status: string;
  tribunal: string;
  classe: string;
  assunto: string;
  area: string;
  foro: string;
  vara: string;
  juiz: string;
  data_distribuicao: string;
  numero_controle: string;
  situacao_processo: string;
  valor_causa: number | null;
  valor_causa_raw: string;
  sentenca: Record<string, any> | null;
  partes: Array<Record<string, any>>;
  movimentacoes: Array<Record<string, any>>;
  mensagem_erro: string;
  tempo_ms: number;
}

export interface ConsultaJobResponse {
  job_id: string;
  tribunal: string;
  total: number;
  status: "enfileirado" | "em_andamento" | "concluido" | "erro";
  concluidos: number;
  resultados: ResultadoRPA[];
}

// ─── Funções da API RPA ───────────────────────────────────────────────────────

export async function dispararConsultaRPA(
  tribunal: string,
  processos: string[]
): Promise<ConsultaJobResponse> {
  // Garante formato CNJ com pontuação (NNNNNNN-DD.AAAA.J.TT.OOOO)
  const processosFormatados = processos.map(formatarNumeroCNJ);
  console.log("[RPA] Disparando consulta:", { tribunal, processos: processosFormatados });

  const res = await fetch(`${RPA_API_BASE}/api/consulta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tribunal, processos: processosFormatados }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`RPA API erro ${res.status}: ${err}`);
  }
  return res.json();
}

export async function verificarStatusRPA(jobId: string): Promise<ConsultaJobResponse> {
  const res = await fetch(`${RPA_API_BASE}/api/consulta/${jobId}`);
  if (!res.ok) throw new Error(`RPA API erro ${res.status}`);
  return res.json();
}

// ─── Polling incremental com inactivity timeout ───────────────────────────────
//
// Em vez de um timeout absoluto (que falha em lotes grandes), usamos
// um "inactivity timeout": se nenhum novo resultado chegar em
// `inactivityMs`, consideramos travado e abortamos.
//
// onProgress: chamado a cada poll com o estado atual do job
// onResult:   chamado imediatamente para cada novo ResultadoRPA que chegar
//             (permite mostrar resultados na UI sem esperar o lote todo)

export async function aguardarResultadoRPA(
  jobId: string,
  onProgress?: (job: ConsultaJobResponse) => void,
  onResult?: (resultado: ResultadoRPA) => void,
  intervaloMs = 3000,
  inactivityMs = 300_000  // 5 min sem novos resultados → timeout
): Promise<ConsultaJobResponse> {
  let ultimosConcluidos = 0;
  let ultimaAtividade = Date.now();
  const vistos = new Set<string>();

  while (true) {
    const job = await verificarStatusRPA(jobId);
    onProgress?.(job);

    // Dispara onResult apenas para resultados que ainda não foram entregues
    for (const r of job.resultados) {
      const chave = r.numero_processo;
      if (!vistos.has(chave)) {
        vistos.add(chave);
        onResult?.(r);
      }
    }

    // Reseta o timer de inatividade sempre que novos processos concluírem
    if (job.concluidos > ultimosConcluidos) {
      ultimosConcluidos = job.concluidos;
      ultimaAtividade = Date.now();
    }

    if (job.status === "concluido" || job.status === "erro") {
      return job;
    }

    if (Date.now() - ultimaAtividade > inactivityMs) {
      throw new Error(
        `Timeout de inatividade: nenhum novo resultado em ${inactivityMs / 60_000} minutos. ` +
        `${job.concluidos}/${job.total} processos concluídos.`
      );
    }

    await new Promise((r) => setTimeout(r, intervaloMs));
  }
}
