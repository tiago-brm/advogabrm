// ─── Tipos da API RPA ─────────────────────────────────────────────────────────

const RPA_API_BASE = "https://khol-rpa.ymlwkl.easypanel.host";

export const RPA_TRIBUNAIS_SUPORTADOS = ["tjms", "tjsp"];

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
  tribunal: "tjms" | "tjsp",
  processos: string[]
): Promise<ConsultaJobResponse> {
  const res = await fetch(`${RPA_API_BASE}/api/consulta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tribunal, processos }),
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

// ─── Polling com timeout ──────────────────────────────────────────────────────

export async function aguardarResultadoRPA(
  jobId: string,
  onProgress?: (job: ConsultaJobResponse) => void,
  intervaloMs = 3000,
  timeoutMs = 120000
): Promise<ConsultaJobResponse> {
  const inicio = Date.now();
  
  while (Date.now() - inicio < timeoutMs) {
    const job = await verificarStatusRPA(jobId);
    onProgress?.(job);
    
    if (job.status === "concluido" || job.status === "erro") {
      return job;
    }
    
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  
  throw new Error("Timeout: O RPA não concluiu a consulta em 2 minutos.");
}
