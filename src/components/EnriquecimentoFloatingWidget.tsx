import { useState } from "react";
import { useEnriquecimentoStore } from "@/stores/enriquecimentoStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Bot, ChevronDown, ChevronUp, X, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

export function EnriquecimentoFloatingWidget() {
  const { job, limparJob } = useEnriquecimentoStore();
  const [minimizado, setMinimizado] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (!job) return null;

  const pct = job.total > 0 ? Math.round((job.concluidos / job.total) * 100) : 0;
  const isActive = job.status === "enfileirado" || job.status === "em_andamento";
  const isError = job.status === "erro";
  const isDone = job.status === "concluido";

  const resultados = Object.values(job.resultadosPorNumero);
  const comDados = resultados.filter(
    (r) => r.status === "sucesso" || r.status === "Em andamento" || r.valor_causa_raw || r.movimentacoes?.length > 0
  ).length;

  const onConsultaPage = location.pathname === "/consulta-processos";

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 shadow-xl rounded-xl border bg-card text-card-foreground overflow-hidden">
      {/* Cabeçalho */}
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer select-none
          ${isError ? "bg-destructive" : "bg-primary"} text-primary-foreground`}
        onClick={() => setMinimizado((v) => !v)}
      >
        {isActive ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : isDone ? (
          <CheckCircle2 className="w-4 h-4 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        )}
        <span className="text-sm font-medium flex-1 truncate">
          {isActive
            ? `RPA — ${job.concluidos}/${job.total} processados`
            : isDone
            ? `Concluído — ${comDados}/${job.total} com dados`
            : `Erro no enriquecimento`}
        </span>
        <Badge variant="secondary" className="text-xs shrink-0 bg-white/20 text-white border-0">
          {job.tribunal.toUpperCase()}
        </Badge>
        {minimizado ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>

      {/* Corpo */}
      {!minimizado && (
        <div className="p-3 space-y-3 bg-card">
          {/* Barra de progresso */}
          {(isActive || isDone) && (
            <div className="space-y-1">
              <Progress value={pct} className="h-1.5" />
              <p className="text-xs text-muted-foreground text-right">{pct}%</p>
            </div>
          )}

          {/* Últimos resultados */}
          {resultados.length > 0 && (
            <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
              {resultados.slice(-6).reverse().map((r) => {
                const ok = r.status === "sucesso" || r.status === "Em andamento" || r.valor_causa_raw;
                return (
                  <div key={r.numero_processo} className="flex items-center gap-2 text-xs">
                    {ok ? (
                      <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                    )}
                    <span className="font-mono truncate flex-1">{r.numero_processo}</span>
                    {r.valor_causa_raw && (
                      <span className="text-green-600 dark:text-green-400 shrink-0">{r.valor_causa_raw}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isError && job.mensagemErro && (
            <p className="text-xs text-red-500">{job.mensagemErro}</p>
          )}

          {/* Ações */}
          <div className="flex gap-2">
            {!onConsultaPage && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => navigate("/consulta-processos")}
              >
                <Bot className="w-3.5 h-3.5 mr-1" />
                Ver resultados
              </Button>
            )}
            {(isDone || isError) && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground"
                onClick={limparJob}
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Fechar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
