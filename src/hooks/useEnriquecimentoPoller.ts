import { useEffect, useRef } from "react";
import { useEnriquecimentoStore } from "@/stores/enriquecimentoStore";
import { verificarStatusRPA } from "@/services/rpaService";
import type { ResultadoRPA } from "@/services/rpaService";
import { setCachedResultado } from "@/services/rpaCache";
import { toast } from "sonner";

const INTERVALO_MS = 3_000;
const INACTIVITY_MS = 300_000; // 5 min sem novo resultado → para

// Montado no layout — sobrevive à navegação e mantém o polling ativo
export function useEnriquecimentoPoller() {
  const { job, atualizarProgresso, registrarResultado, concluirJob, falharJob } =
    useEnriquecimentoStore();

  const vistos = useRef<Set<string>>(new Set());
  const ultimaAtividade = useRef<number>(Date.now());
  const ultimosConcluidos = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeJobId = useRef<string | null>(null);

  useEffect(() => {
    if (!job) {
      vistos.current.clear();
      activeJobId.current = null;
      ultimaAtividade.current = Date.now();
      ultimosConcluidos.current = 0;
      return;
    }

    // Novo job iniciado — resetar rastreamento
    if (job.jobId !== activeJobId.current) {
      vistos.current.clear();
      ultimaAtividade.current = Date.now();
      ultimosConcluidos.current = 0;
      activeJobId.current = job.jobId;
    }

    // Já terminou — não precisa de poller
    if (job.status === "concluido" || job.status === "erro") return;

    async function poll() {
      if (!job) return;

      try {
        const apiJob = await verificarStatusRPA(job.jobId);
        atualizarProgresso(apiJob);

        // Entrega resultados novos imediatamente e persiste no cache
        for (const r of apiJob.resultados) {
          if (!vistos.current.has(r.numero_processo)) {
            vistos.current.add(r.numero_processo);
            registrarResultado(r);

            const isOk = r.status === "sucesso" || r.status === "Em andamento";
            const temDados = !!(r.valor_causa_raw || r.movimentacoes?.length > 0 || r.vara || r.juiz);
            if (isOk || temDados) {
              // Salva no cache Supabase para evitar re-consulta nos próximos 10 dias
              setCachedResultado(r.numero_processo, job.tribunal, r);
              toast.success(`✅ ${r.numero_processo} — enriquecido`, { duration: 3000 });
            }
          }
        }

        // Reseta inatividade se concluídos cresceu
        if (apiJob.concluidos > ultimosConcluidos.current) {
          ultimaAtividade.current = Date.now();
          ultimosConcluidos.current = apiJob.concluidos;
        }

        if (apiJob.status === "concluido") {
          concluirJob();
          toast.success(
            `Enriquecimento concluído — ${apiJob.concluidos}/${apiJob.total} processos.`,
            { duration: 5000 }
          );
          return;
        }

        if (apiJob.status === "erro") {
          falharJob("Erro retornado pela API RPA.");
          return;
        }

        // Inactivity timeout
        if (Date.now() - ultimaAtividade.current > INACTIVITY_MS) {
          falharJob(
            `Timeout: nenhum resultado novo em ${INACTIVITY_MS / 60_000} min. ` +
            `${apiJob.concluidos}/${apiJob.total} concluídos.`
          );
          toast.error("Enriquecimento parou por inatividade.");
          return;
        }

        timerRef.current = setTimeout(poll, INTERVALO_MS);
      } catch (err: any) {
        falharJob(err.message);
        toast.error(`Erro no polling: ${err.message}`);
      }
    }

    timerRef.current = setTimeout(poll, INTERVALO_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [job?.jobId, job?.status]);
}
