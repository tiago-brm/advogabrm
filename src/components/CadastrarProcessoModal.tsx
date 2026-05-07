import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckCircle, AlertTriangle, User, Users, ListChecks } from "lucide-react";
import { ResultadoRPA } from "@/services/rpaService";
import { verificarConflitos, type ConflictResult } from "@/services/conflictCheckService";

const AREA_KEYWORDS: Record<string, string[]> = {
  Trabalhista: ["trabalh", "reclamatória", "reclamação", "rescis", "verbas", "trt", "horas extras", "clt"],
  Família: ["divórcio", "divorcio", "guarda", "alimentos", "família", "familia", "separação", "união estável"],
  Inventário: ["inventário", "inventario", "espólio", "herança", "heranca", "sucessão", "partilha", "óbito"],
  Tributário: ["tribut", "fiscal", "imposto", "icms", "iss", "irpf", "débito fiscal", "auto de infração"],
  Cível: [],  // fallback
};

function detectarArea(assunto: string): string {
  const lower = assunto.toLowerCase();
  for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
    if (area === "Cível") continue;
    if (keywords.some((k) => lower.includes(k))) return area;
  }
  return "Cível";
}

interface Props {
  open: boolean;
  onClose: () => void;
  processoDataJud: {
    numeroProcesso: string;
    assuntos?: Array<{ nome: string }>;
    dataAjuizamento?: string;
    partes?: Array<{ nome: string; tipo: string }>;
  };
  processoRPA?: ResultadoRPA | null;
}

export function CadastrarProcessoModal({ open, onClose, processoDataJud, processoRPA }: Props) {
  const { user } = useAuth();
  const [clienteId, setClienteId] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [prioridade, setPrioridade] = useState<"Alta" | "Média" | "Baixa">("Média");
  const [dataLimite, setDataLimite] = useState("");
  const [loading, setLoading] = useState(false);

  const [conflitos, setConflitos] = useState<ConflictResult[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [conflitoCiente, setConflitoCiente] = useState(false);
  const [tarefasCriadas, setTarefasCriadas] = useState(0);

  const { data: clientes } = useQuery({
    queryKey: ["clientes-select", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: open && !!user,
  });

  // Roda o conflict check ao abrir o modal, combinando partes do DataJud e do RPA
  useEffect(() => {
    if (!open) return;

    const partes: Array<{ nome: string; tipo?: string }> = [
      ...(processoDataJud.partes ?? []),
      ...(processoRPA?.partes?.map((p: any) => ({
        nome: p.nome || p.name || "",
        tipo: p.tipo,
      })) ?? []),
    ].filter((p) => p.nome.length > 3);

    if (!partes.length) return;

    setCheckingConflicts(true);
    setConflitos([]);
    setConflitoCiente(false);

    verificarConflitos(partes)
      .then(setConflitos)
      .finally(() => setCheckingConflicts(false));
  }, [open]);

  const assunto = processoRPA?.assunto
    || processoDataJud.assuntos?.[0]?.nome
    || "Não informado";

  const dataInicio = processoRPA?.data_distribuicao
    ? processoRPA.data_distribuicao.split("T")[0]
    : processoDataJud.dataAjuizamento?.split("T")[0] || new Date().toISOString().split("T")[0];

  const valorCausa = processoRPA?.valor_causa ?? undefined;

  const instancia = processoRPA?.vara
    ? `${processoRPA.vara}${processoRPA.foro ? ` — ${processoRPA.foro}` : ""}`
    : undefined;

  const podeeSalvar = !!clienteId && (conflitos.length === 0 || conflitoCiente);

  async function aplicarChecklist() {
    const area = detectarArea(assunto);
    const { data: templates } = await supabase
      .from("checklist_templates")
      .select("tarefas")
      .eq("area", area)
      .eq("is_global", true)
      .limit(1)
      .maybeSingle();

    if (!templates?.tarefas) return 0;

    const hoje = new Date();
    const tarefas = (templates.tarefas as Array<{ titulo: string; prazo_dias: number; prioridade: string }>)
      .map((t) => {
        const prazo = new Date(hoje);
        prazo.setDate(prazo.getDate() + t.prazo_dias);
        return {
          user_id: user!.id,
          descricao: t.titulo,
          data_conclusao: prazo.toISOString().split("T")[0],
          prioridade: t.prioridade as "Alta" | "Média" | "Baixa",
          status: "Pendente" as const,
          responsavel: responsavel || "A definir",
        };
      });

    const { error } = await supabase.from("tarefas").insert(tarefas);
    if (error) console.warn("Erro ao criar tarefas do checklist:", error);
    return tarefas.length;
  }

  async function handleSalvar() {
    if (!clienteId) { toast.error("Selecione um cliente"); return; }
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("processos")
        .insert({
          user_id: user.id,
          cliente_id: clienteId,
          numero: processoDataJud.numeroProcesso,
          assunto,
          status: "Em Andamento",
          data_inicio: dataInicio,
          data_limite: dataLimite || null,
          prioridade,
          responsavel: responsavel || processoRPA?.juiz || null,
          valor_causa: valorCausa || null,
          instancia: instancia || null,
        });

      if (error) {
        if (error.code === "23505") {
          toast.error("Este processo já está cadastrado no sistema.");
        } else {
          throw error;
        }
        return;
      }

      const qtd = await aplicarChecklist();
      setTarefasCriadas(qtd);

      if (qtd > 0) {
        toast.success(`Processo cadastrado! ${qtd} tarefas criadas automaticamente.`, {
          description: `Checklist de ${detectarArea(assunto)} aplicado.`,
          icon: <ListChecks className="w-4 h-4" />,
        });
      } else {
        toast.success("Processo cadastrado com sucesso!");
      }
      onClose();
    } catch (err: any) {
      toast.error(`Erro ao cadastrar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Cadastrar Processo
          </DialogTitle>
          <DialogDescription>
            Os dados foram pré-preenchidos pelo DataJud {processoRPA ? "e enriquecidos pelo RPA" : ""}.
            Revise e complete as informações.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ── Conflict check ── */}
          {checkingConflicts && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 border rounded bg-muted/30">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Verificando conflitos de interesse...
            </div>
          )}

          {!checkingConflicts && conflitos.length > 0 && (
            <Alert variant="destructive" className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-700">
              <AlertTriangle className="h-4 w-4 !text-amber-600 dark:!text-amber-400" />
              <AlertTitle className="text-amber-800 dark:text-amber-300">
                Possível conflito de interesse detectado
              </AlertTitle>
              <AlertDescription className="space-y-2 mt-2">
                <p className="text-xs">
                  As partes abaixo foram encontradas no processo e correspondem a registros existentes no sistema:
                </p>
                <ul className="space-y-1.5">
                  {conflitos.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      {c.matchTipo === "cliente" ? (
                        <User className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
                      ) : (
                        <Users className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
                      )}
                      <span>
                        <span className="font-semibold">{c.nomeParteProcesso}</span>
                        <Badge variant="outline" className="mx-1 text-[10px] border-amber-400">
                          {c.tipoParteProcesso}
                        </Badge>
                        corresponde ao {c.matchTipo === "cliente" ? "cliente" : "membro da equipe"}{" "}
                        <span className="font-semibold">{c.nomeMatch}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 pt-1 border-t border-amber-300 dark:border-amber-700">
                  <Checkbox
                    id="ciente-conflito"
                    checked={conflitoCiente}
                    onCheckedChange={(v) => setConflitoCiente(!!v)}
                    className="border-amber-500 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                  />
                  <label htmlFor="ciente-conflito" className="text-xs cursor-pointer">
                    Estou ciente do conflito e desejo prosseguir com o cadastro
                  </label>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Número */}
          <div className="space-y-1">
            <Label>Número do Processo</Label>
            <Input value={processoDataJud.numeroProcesso} readOnly className="bg-muted font-mono text-sm" />
          </div>

          {/* Assunto */}
          <div className="space-y-1">
            <Label>Assunto</Label>
            <Input value={assunto} readOnly className="bg-muted text-sm" />
          </div>

          {/* Dados do RPA */}
          {processoRPA && (
            <div className="grid grid-cols-2 gap-3">
              {processoRPA.vara && (
                <div className="space-y-1">
                  <Label>Vara</Label>
                  <Input value={processoRPA.vara} readOnly className="bg-muted text-xs" />
                </div>
              )}
              {processoRPA.juiz && (
                <div className="space-y-1">
                  <Label>Juiz</Label>
                  <Input value={processoRPA.juiz} readOnly className="bg-muted text-xs" />
                </div>
              )}
              {processoRPA.situacao_processo && (
                <div className="space-y-1">
                  <Label>Situação</Label>
                  <Input value={processoRPA.situacao_processo} readOnly className="bg-muted text-xs" />
                </div>
              )}
              {processoRPA.valor_causa_raw && (
                <div className="space-y-1">
                  <Label>Valor da Causa</Label>
                  <Input value={processoRPA.valor_causa_raw} readOnly className="bg-muted text-xs" />
                </div>
              )}
            </div>
          )}

          {/* Cliente */}
          <div className="space-y-1">
            <Label>Cliente *</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente vinculado" />
              </SelectTrigger>
              <SelectContent>
                {clientes?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Vincule este processo a um cliente já cadastrado.</p>
          </div>

          {/* Responsável */}
          <div className="space-y-1">
            <Label>Responsável</Label>
            <Input
              placeholder="Nome do advogado responsável"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Data de Início</Label>
              <Input type="date" value={dataInicio} readOnly className="bg-muted text-sm" />
            </div>
            <div className="space-y-1">
              <Label>Data Limite (Prazo)</Label>
              <Input
                type="date"
                value={dataLimite}
                onChange={(e) => setDataLimite(e.target.value)}
              />
            </div>
          </div>

          {/* Prioridade */}
          <div className="space-y-1">
            <Label>Prioridade</Label>
            <Select value={prioridade} onValueChange={(v) => setPrioridade(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Alta">Alta</SelectItem>
                <SelectItem value="Média">Média</SelectItem>
                <SelectItem value="Baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={loading || !podeeSalvar}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            Cadastrar Processo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
