import { create } from "zustand";
import type { ResultadoRPA, ConsultaJobResponse } from "@/services/rpaService";

// Espelho do ProcessoResult do ConsultaProcessos — evita importar a página no store
export interface ProcessoResultSnapshot {
  numeroProcesso: string;
  classe?: { codigo: number; nome: string } | string;
  tribunal?: string;
  sistema?: string;
  formato?: string;
  grau?: string;
  dataAjuizamento?: string;
  dataHoraUltimaAtualizacao?: string;
  orgaoJulgador?: { codigo?: number; nome: string; codigoMunicipioIBGE?: number };
  assuntos?: Array<{ codigo: number; nome: string }>;
  nivelSigilo?: number;
  partes?: Array<{ nome: string; tipo: string; docPrincipal?: { nrDoc: string; tpDoc: string }; advogados?: Array<{ nome: string; inscricao: string }> }>;
  movimentos?: Array<{ codigo: number; nome: string; dataHora: string }>;
}

export interface ConsultaSession {
  tribunal: string;
  resultados: ProcessoResultSnapshot[];
  totalResultados: number;
  currentPage: number;
}

export interface EnriquecimentoJob {
  jobId: string;
  tribunal: string;
  processos: string[];
  total: number;
  concluidos: number;
  status: "enfileirado" | "em_andamento" | "concluido" | "erro";
  resultadosPorNumero: Record<string, ResultadoRPA>;
  mensagemErro?: string;
  criadoEm: number;
}

interface EnriquecimentoStore {
  job: EnriquecimentoJob | null;
  consulta: ConsultaSession | null;

  iniciarJob: (params: {
    jobId: string;
    tribunal: string;
    processos: string[];
    total: number;
  }) => void;

  atualizarProgresso: (job: ConsultaJobResponse) => void;

  registrarResultado: (resultado: ResultadoRPA) => void;

  concluirJob: () => void;

  falharJob: (mensagem: string) => void;

  limparJob: () => void;

  salvarConsulta: (session: ConsultaSession) => void;

  limparConsulta: () => void;
}

export const useEnriquecimentoStore = create<EnriquecimentoStore>((set) => ({
  job: null,
  consulta: null,

  iniciarJob: ({ jobId, tribunal, processos, total }) =>
    set({
      job: {
        jobId,
        tribunal,
        processos,
        total,
        concluidos: 0,
        status: "enfileirado",
        resultadosPorNumero: {},
        criadoEm: Date.now(),
      },
    }),

  atualizarProgresso: (apiJob) =>
    set((s) => {
      if (!s.job) return s;
      return {
        job: {
          ...s.job,
          concluidos: apiJob.concluidos,
          status: apiJob.status,
        },
      };
    }),

  registrarResultado: (resultado) =>
    set((s) => {
      if (!s.job) return s;
      return {
        job: {
          ...s.job,
          resultadosPorNumero: {
            ...s.job.resultadosPorNumero,
            [resultado.numero_processo]: resultado,
          },
        },
      };
    }),

  concluirJob: () =>
    set((s) => {
      if (!s.job) return s;
      return { job: { ...s.job, status: "concluido" } };
    }),

  falharJob: (mensagem) =>
    set((s) => {
      if (!s.job) return s;
      return { job: { ...s.job, status: "erro", mensagemErro: mensagem } };
    }),

  limparJob: () => set({ job: null }),

  salvarConsulta: (session) => set({ consulta: session }),

  limparConsulta: () => set({ consulta: null }),
}));
