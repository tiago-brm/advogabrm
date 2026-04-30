import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckCircle, User, UserPlus, ChevronRight } from "lucide-react";
import { MonitoramentoProcesso } from "@/types/monitoramento";

interface Props {
  open: boolean;
  onClose: () => void;
  monitoramento: MonitoramentoProcesso;
  onConvertido?: () => void;
}

type Modo = "selecionar_parte" | "vincular_cliente";

export function AceitarCasoModal({ open, onClose, monitoramento, onConvertido }: Props) {
  const { user } = useAuth();
  const [modo, setModo] = useState<Modo>("selecionar_parte");
  const [parteEscolhida, setParteEscolhida] = useState<{ nome: string; tipo: string } | null>(null);
  const [modoCliente, setModoCliente] = useState<"existente" | "novo">("existente");

  // Existente
  const [clienteId, setClienteId] = useState("");

  // Novo cliente inline
  const [novoNome, setNovoNome] = useState("");
  const [novoCpfCnpj, setNovoCpfCnpj] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");

  // Campos do processo
  const [responsavel, setResponsavel] = useState("");
  const [prioridade, setPrioridade] = useState<"Alta" | "Média" | "Baixa">("Média");
  const [dataLimite, setDataLimite] = useState("");

  const [loading, setLoading] = useState(false);

  const partes: Array<{ nome: string; tipo: string }> = monitoramento.partes ?? [];

  const { data: clientes } = useQuery({
    queryKey: ["clientes-aceitar", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, cpf_cnpj")
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: open && modo === "vincular_cliente" && !!user,
  });

  function handleEscolherParte(parte: { nome: string; tipo: string }) {
    setParteEscolhida(parte);
    setNovoNome(parte.nome);
    setModo("vincular_cliente");
  }

  async function handleAceitar() {
    if (!user) return;
    setLoading(true);

    try {
      let finalClienteId = clienteId;

      // Se for criar novo cliente
      if (modoCliente === "novo") {
        if (!novoNome.trim()) { toast.error("Informe o nome do cliente"); setLoading(false); return; }
        const { data: novoCliente, error: errCliente } = await supabase
          .from("clientes")
          .insert({
            user_id: user.id,
            nome: novoNome.trim(),
            cpf_cnpj: novoCpfCnpj.trim() || null,
            email: novoEmail.trim() || null,
            telefone: novoTelefone.trim() || null,
          })
          .select("id")
          .single();
        if (errCliente) throw errCliente;
        finalClienteId = novoCliente.id;
      }

      if (!finalClienteId) { toast.error("Selecione ou crie um cliente"); setLoading(false); return; }

      // Criar processo
      const { data: novoProcesso, error: errProcesso } = await supabase
        .from("processos")
        .insert({
          user_id: user.id,
          cliente_id: finalClienteId,
          numero: monitoramento.numero,
          assunto: monitoramento.assunto || "Não informado",
          status: "Em Andamento",
          data_inicio: new Date().toISOString().split("T")[0],
          data_limite: dataLimite || null,
          prioridade,
          responsavel: responsavel || monitoramento.juiz || null,
          valor_causa: monitoramento.valor_causa ?? null,
          instancia: monitoramento.vara || null,
        })
        .select("id")
        .single();

      if (errProcesso) {
        if (errProcesso.code === "23505") throw new Error("Este processo já está cadastrado no sistema.");
        throw errProcesso;
      }

      // Marcar monitoramento como convertido
      await supabase
        .from("monitoramento_processos")
        .update({ convertido_em: novoProcesso.id })
        .eq("id", monitoramento.id);

      toast.success("Caso aceito! Processo cadastrado com sucesso.");
      onConvertido?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
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
            Aceitar Caso
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{monitoramento.numero}</span>
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: Selecionar parte */}
        {modo === "selecionar_parte" && (
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-semibold mb-3">Qual parte você vai representar?</p>
              <div className="space-y-2">
                {partes.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handleEscolherParte(p)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 hover:border-primary transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{p.nome}</p>
                        <Badge variant="outline" className="text-xs mt-0.5">{p.tipo}</Badge>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ))}

                <button
                  onClick={() => { setParteEscolhida(null); setModo("vincular_cliente"); }}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-dashed hover:bg-muted/30 transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <UserPlus className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Outra parte / não listada</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Vincular/criar cliente */}
        {modo === "vincular_cliente" && (
          <div className="space-y-4 py-2">
            {parteEscolhida && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-primary shrink-0" />
                <span>Representando: <strong>{parteEscolhida.nome}</strong></span>
                <Badge variant="outline" className="ml-auto text-xs">{parteEscolhida.tipo}</Badge>
              </div>
            )}

            {/* Toggle existente/novo */}
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setModoCliente("existente")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${modoCliente === "existente" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              >
                Cliente existente
              </button>
              <button
                onClick={() => setModoCliente("novo")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${modoCliente === "novo" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              >
                Criar novo cliente
              </button>
            </div>

            {modoCliente === "existente" ? (
              <div className="space-y-1">
                <Label>Cliente *</Label>
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                        {c.cpf_cnpj && <span className="text-muted-foreground ml-2 text-xs">{c.cpf_cnpj}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Novo Cliente</p>
                <div className="space-y-1">
                  <Label>Nome *</Label>
                  <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome completo ou razão social" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>CPF / CNPJ</Label>
                    <Input value={novoCpfCnpj} onChange={(e) => setNovoCpfCnpj(e.target.value)} placeholder="000.000.000-00" />
                  </div>
                  <div className="space-y-1">
                    <Label>Telefone</Label>
                    <Input value={novoTelefone} onChange={(e) => setNovoTelefone(e.target.value)} placeholder="(67) 99999-0000" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>E-mail</Label>
                  <Input type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="cliente@email.com" />
                </div>
              </div>
            )}

            <Separator />

            {/* Dados do processo */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Dados do Processo</p>
              <div className="space-y-1">
                <Label>Responsável</Label>
                <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Advogado responsável" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Data Limite</Label>
                  <Input type="date" value={dataLimite} onChange={(e) => setDataLimite(e.target.value)} />
                </div>
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
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {modo === "vincular_cliente" && partes.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setModo("selecionar_parte")} className="sm:mr-auto">
              ← Voltar
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          {modo === "vincular_cliente" && (
            <Button onClick={handleAceitar} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Aceitar Caso
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
