import React, { useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckCircle } from "lucide-react";
import { ResultadoRPA } from "@/services/rpaService";

interface Props {
  open: boolean;
  onClose: () => void;
  processoDataJud: {
    numeroProcesso: string;
    assuntos?: Array<{ nome: string }>;
    dataAjuizamento?: string;
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

  // Busca clientes do tenant
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

  // Preenche dados automaticamente do DataJud / RPA
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

  async function handleSalvar() {
    if (!clienteId) { toast.error("Selecione um cliente"); return; }
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase.from("processos").insert({
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
      } else {
        toast.success("Processo cadastrado com sucesso!");
        onClose();
      }
    } catch (err: any) {
      toast.error(`Erro ao cadastrar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
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

          {/* Dados do RPA, se disponíveis */}
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

          {/* Cliente — OBRIGATÓRIO */}
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
            {/* Data Início */}
            <div className="space-y-1">
              <Label>Data de Início</Label>
              <Input type="date" value={dataInicio} readOnly className="bg-muted text-sm" />
            </div>

            {/* Data Limite */}
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
          <Button onClick={handleSalvar} disabled={loading || !clienteId}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            Cadastrar Processo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
