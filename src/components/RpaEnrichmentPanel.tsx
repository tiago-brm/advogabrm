import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Bot, Loader2, CheckCircle2, AlertTriangle, Zap,
  User, Building2, Scale, DollarSign, Gavel, TrendingUp,
  FilePlus, ChevronDown, ChevronUp, Eye
} from "lucide-react";
import { toast } from "sonner";
import {
  ResultadoRPA,
  ConsultaJobResponse,
  dispararConsultaRPA,
  aguardarResultadoRPA,
  RPA_TRIBUNAIS_SUPORTADOS,
} from "@/services/rpaService";
import { getCachedResultado, setCachedResultado } from "@/services/rpaCache";
import { CadastrarProcessoModal } from "@/components/CadastrarProcessoModal";
import { MonitorarProcessoModal } from "@/components/MonitorarProcessoModal";

interface ProcessoDataJud {
  numeroProcesso: string;
  classe?: { codigo: number; nome: string } | string;
  tribunal?: string;
  assuntos?: Array<{ nome: string }>;
  dataAjuizamento?: string;
  orgaoJulgador?: { nome: string };
  partes?: Array<{ nome: string; tipo: string }>;
}

interface Props {
  processo: ProcessoDataJud;
  tribunalAlias: string; // alias DataJud (ex: "tjms")
  resultadoBulk?: ResultadoRPA; // resultado já disponível via enriquecimento em massa
}

type EnriquecimentoState =
  | { fase: "idle" }
  | { fase: "disparando" }
  | { fase: "aguardando"; job: ConsultaJobResponse }
  | { fase: "concluido"; resultado: ResultadoRPA; diasCache?: number }
  | { fase: "erro"; mensagem: string };

export function RpaEnrichmentPanel({ processo, tribunalAlias, resultadoBulk }: Props) {
  const [estado, setEstado] = useState<EnriquecimentoState>(
    resultadoBulk ? { fase: "concluido", resultado: resultadoBulk } : { fase: "idle" }
  );

  // Verifica cache Supabase ao montar o card
  useEffect(() => {
    if (estado.fase !== "idle") return;
    getCachedResultado(processo.numeroProcesso).then((entry) => {
      if (entry) setEstado({ fase: "concluido", resultado: entry.resultado, diasCache: entry.diasAtras });
    });
  }, [processo.numeroProcesso]);

  // Quando o bulk entregar um resultado para este card, atualiza o estado
  useEffect(() => {
    if (resultadoBulk) {
      setEstado({ fase: "concluido", resultado: resultadoBulk });
    }
  }, [resultadoBulk]);
  const [modalCadastro, setModalCadastro] = useState(false);
  const [modalMonitorar, setModalMonitorar] = useState(false);
  const [expandidoMovs, setExpandidoMovs] = useState(false);
  const abortRef = useRef(false);

  const isCompativel = RPA_TRIBUNAIS_SUPORTADOS.includes(tribunalAlias);

  const handleEnriquecer = useCallback(async () => {
    if (!isCompativel) return;
    abortRef.current = false;
    setEstado({ fase: "disparando" });

    try {
      toast.info("🤖 Acionando RPA para consulta enriquecida...");
      const job = await dispararConsultaRPA(tribunalAlias, [processo.numeroProcesso]);
      setEstado({ fase: "aguardando", job });

      // onResult dispara imediatamente para cada resultado que chegar durante o polling
      let resultadoEntregue = false;
      const resultado = await aguardarResultadoRPA(
        job.job_id,
        (progresso) => {
          // Só atualiza o progresso se ainda não temos resultado — evita sobrescrever
          setEstado((prev) => prev.fase === "concluido" ? prev : { fase: "aguardando", job: progresso });
        },
        (r) => {
          resultadoEntregue = true;
          // "sucesso" = dados completos; "Em andamento" = processo existe, sem sentença (válido)
          const isSuccess = r.status === "sucesso" || r.status === "Em andamento";
          const temDados = !!(r.valor_causa_raw || r.movimentacoes?.length > 0 || r.partes?.length > 0 || r.vara || r.juiz);
          if (isSuccess || temDados) {
            setEstado({ fase: "concluido", resultado: r });
            setCachedResultado(r.numero_processo, tribunalAlias, r);
            toast.success(r.status === "Em andamento" ? "✅ Processo em andamento — dados coletados" : "✅ Enriquecimento concluído!");
          } else if (r.status === "erro_tecnico") {
            setEstado({ fase: "erro", mensagem: r.mensagem_erro || "Falha técnica no bot (timeout ou captcha)." });
            toast.warning("⚠️ RPA: erro técnico na coleta.");
          } else {
            // erro_logico ou desconhecido
            const erroInterno = r.mensagem_erro?.includes("_UCWrapper") || r.mensagem_erro?.includes("unexpected keyword");
            if (erroInterno) {
              setEstado({ fase: "erro", mensagem: "O RPA ainda não tem suporte para este formato de número de processo." });
              toast.warning("⚠️ RPA: processo incompatível com esta versão do bot.");
            } else {
              setEstado({ fase: "erro", mensagem: r.mensagem_erro || "RPA não encontrou o processo." });
              toast.warning(`⚠️ RPA: ${r.mensagem_erro || "sem resultado"}`);
            }
          }
        }
      );

      // Fallback: se o job concluiu mas onResult nunca foi chamado (resultado vazio)
      if (!resultadoEntregue) {
        if (resultado.resultados.length === 0) {
          setEstado({ fase: "erro", mensagem: "Nenhum resultado retornado pelo RPA." });
        }
      }
    } catch (err: any) {
      setEstado({ fase: "erro", mensagem: err.message });
      toast.error(`Erro no enriquecimento: ${err.message}`);
    }
  }, [processo, tribunalAlias, isCompativel]);

  if (!isCompativel) {
    return (
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded p-2 bg-muted/30">
          <Bot className="w-3.5 h-3.5 shrink-0" />
          <span>Enriquecimento via RPA disponível apenas para TJMS e TJSP.</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setModalMonitorar(true)} className="flex-1 border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20">
            <Eye className="w-3.5 h-3.5 mr-1.5" /> Monitorar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setModalCadastro(true)} className="flex-1">
            <FilePlus className="w-3.5 h-3.5 mr-1.5" /> Cadastrar
          </Button>
        </div>
        {modalMonitorar && (
          <MonitorarProcessoModal open={modalMonitorar} onClose={() => setModalMonitorar(false)}
            tribunalAlias={tribunalAlias} processoDataJud={processo} processoRPA={null} />
        )}
        {modalCadastro && (
          <CadastrarProcessoModal open={modalCadastro} onClose={() => setModalCadastro(false)}
            processoDataJud={processo} processoRPA={null} />
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Botões de acionamento idle */}
      {estado.fase === "idle" && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnriquecer}
            className="flex-1 border-primary/40 text-primary hover:bg-primary/5"
          >
            <Zap className="w-3.5 h-3.5 mr-2" />
            Enriquecer ({tribunalAlias.toUpperCase()})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalMonitorar(true)}
            className="border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
            title="Monitorar sem cadastrar cliente agora"
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Disparando */}
      {estado.fase === "disparando" && (
        <div className="flex items-center gap-2 text-sm text-primary p-2 border border-primary/20 rounded bg-primary/5">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>Acionando RPA...</span>
        </div>
      )}

      {/* Aguardando */}
      {estado.fase === "aguardando" && (
        <div className="flex items-center gap-2 text-sm text-primary p-2 border border-primary/20 rounded bg-primary/5">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>
            RPA em execução — {estado.job.concluidos}/{estado.job.total} concluídos...
          </span>
        </div>
      )}

      {/* Erro */}
      {estado.fase === "erro" && (
        <div className="flex items-center justify-between gap-2 text-sm text-red-600 dark:text-red-400 p-2 border border-red-200 dark:border-red-800 rounded bg-red-50 dark:bg-red-950/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{estado.mensagem}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEstado({ fase: "idle" })}>
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Resultado enriquecido */}
      {estado.fase === "concluido" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2 text-primary">
              <Bot className="w-4 h-4" />
              Dados Enriquecidos pelo RPA
              {estado.diasCache !== undefined ? (
                <Badge variant="outline" className="text-xs ml-auto border-primary/40 text-primary">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {estado.diasCache === 0 ? "Cache de hoje" : `Cache de ${estado.diasCache}d atrás`}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs ml-auto border-green-500 text-green-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {(estado.resultado.tempo_ms / 1000).toFixed(1)}s
                </Badge>
              )}
            </CardTitle>
          </CardHeader>

          <CardContent className="px-4 pb-3 space-y-3">
            {/* Grid de dados enriquecidos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {estado.resultado.situacao_processo && (
                <DataItem icon={TrendingUp} label="Situação" value={estado.resultado.situacao_processo} />
              )}
              {estado.resultado.juiz && (
                <DataItem icon={Gavel} label="Juiz" value={estado.resultado.juiz} />
              )}
              {estado.resultado.vara && (
                <DataItem icon={Building2} label="Vara" value={estado.resultado.vara} />
              )}
              {estado.resultado.foro && (
                <DataItem icon={Scale} label="Foro" value={estado.resultado.foro} />
              )}
              {estado.resultado.area && (
                <DataItem icon={Scale} label="Área" value={estado.resultado.area} />
              )}
              {estado.resultado.valor_causa_raw && (
                <DataItem icon={DollarSign} label="Valor da Causa" value={estado.resultado.valor_causa_raw} highlight />
              )}
            </div>

            {/* Sentença */}
            {estado.resultado.sentenca && Object.keys(estado.resultado.sentenca).length > 0 && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Sentença</p>
                  <div className="bg-card rounded border p-2 text-xs space-y-1">
                    {Object.entries(estado.resultado.sentenca).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-muted-foreground capitalize min-w-[80px]">{k}:</span>
                        <span className="font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Partes enriquecidas */}
            {estado.resultado.partes.length > 0 && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                    Partes ({estado.resultado.partes.length})
                  </p>
                  <div className="space-y-1">
                    {estado.resultado.partes.slice(0, 4).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <User className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="font-medium">{p.nome || p.name || JSON.stringify(p)}</span>
                        {p.tipo && <Badge variant="outline" className="text-[10px] ml-auto">{p.tipo}</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Movimentações */}
            {estado.resultado.movimentacoes.length > 0 && (
              <>
                <Separator />
                <div className="space-y-1">
                  <button
                    onClick={() => setExpandidoMovs(!expandidoMovs)}
                    className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground tracking-wide w-full text-left hover:text-foreground transition-colors"
                  >
                    Movimentações ({estado.resultado.movimentacoes.length})
                    {expandidoMovs ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                  </button>

                  {expandidoMovs && (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {estado.resultado.movimentacoes.map((m, i) => (
                        <div key={i} className="border-l-2 border-primary/30 pl-2 text-xs">
                          <p className="font-medium">{m.descricao || m.nome || m.tipo || "Movimento"}</p>
                          {(m.data || m.dataHora) && (
                            <p className="text-muted-foreground">
                              {new Date(m.data || m.dataHora).toLocaleDateString("pt-BR")}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Banner de ações pós-enriquecimento */}
            <Separator />
            <div className="flex items-center gap-2 pt-1">
              <p className="text-xs text-muted-foreground flex-1">O que deseja fazer?</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalMonitorar(true)}
                className="border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
              >
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                Monitorar
              </Button>
              <Button
                size="sm"
                onClick={() => setModalCadastro(true)}
                className="shrink-0"
              >
                <FilePlus className="w-3.5 h-3.5 mr-1.5" />
                Cadastrar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Botão de ações no estado idle sem enriquecimento */}
      {estado.fase === "idle" && null /* botões já acima */}

      {/* Estado erro: manter opções */}
      {estado.fase === "erro" && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setModalMonitorar(true)}
            className="flex-1 border-amber-400 text-amber-600 hover:bg-amber-50">
            <Eye className="w-3.5 h-3.5 mr-1.5" /> Monitorar mesmo assim
          </Button>
        </div>
      )}

      {modalCadastro && (
        <CadastrarProcessoModal
          open={modalCadastro}
          onClose={() => setModalCadastro(false)}
          processoDataJud={processo}
          processoRPA={estado.fase === "concluido" ? estado.resultado : null}
        />
      )}

      {modalMonitorar && (
        <MonitorarProcessoModal
          open={modalMonitorar}
          onClose={() => setModalMonitorar(false)}
          tribunalAlias={tribunalAlias}
          processoDataJud={processo}
          processoRPA={estado.fase === "concluido" ? estado.resultado : null}
        />
      )}
    </div>
  );
}

// ─── Subcomponente de item de dado ────────────────────────────────────────────
function DataItem({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: any;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2 p-1.5 rounded ${highlight ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" : ""}`}>
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${highlight ? "text-green-600" : "text-muted-foreground"}`} />
      <div>
        <p className="text-muted-foreground leading-none">{label}</p>
        <p className={`font-medium mt-0.5 ${highlight ? "text-green-700 dark:text-green-400" : ""}`}>{value}</p>
      </div>
    </div>
  );
}
