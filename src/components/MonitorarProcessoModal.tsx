import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Eye, Loader2, User } from "lucide-react";
import { ResultadoRPA } from "@/services/rpaService";

interface ProcessoDataJud {
  numeroProcesso: string;
  classe?: { codigo: number; nome: string } | string;
  tribunal?: string;
  assuntos?: Array<{ nome: string }>;
  orgaoJulgador?: { nome: string };
  partes?: Array<{ nome: string; tipo: string }>;
  dataAjuizamento?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  tribunalAlias: string;
  processoDataJud: ProcessoDataJud;
  processoRPA?: ResultadoRPA | null;
}

export function MonitorarProcessoModal({ open, onClose, tribunalAlias, processoDataJud, processoRPA }: Props) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);

  // Consolidar partes de ambas as fontes
  const partes: Array<{ nome: string; tipo: string }> = [
    ...(processoRPA?.partes?.map((p) => ({ nome: p.nome || String(p), tipo: p.tipo || "Parte" })) ?? []),
    ...(processoDataJud.partes?.map((p) => ({ nome: p.nome, tipo: p.tipo })) ?? []),
  ].filter((p, i, arr) => arr.findIndex((x) => x.nome === p.nome) === i); // dedup por nome

  const classeNome = typeof processoDataJud.classe === "string"
    ? processoDataJud.classe
    : processoDataJud.classe?.nome ?? null;

  async function handleMonitorar() {
    if (!user || !tenant) return;
    setLoading(true);

    try {
      const { error } = await supabase.from("monitoramento_processos").upsert({
        tenant_id: tenant.id,
        user_id: user.id,
        numero: processoDataJud.numeroProcesso,
        tribunal: tribunalAlias,
        dados_datajud: processoDataJud,
        dados_rpa: processoRPA ?? {},
        assunto: processoRPA?.assunto || processoDataJud.assuntos?.[0]?.nome || null,
        classe: classeNome,
        situacao: processoRPA?.situacao_processo || null,
        valor_causa: processoRPA?.valor_causa ?? null,
        vara: processoRPA?.vara || processoDataJud.orgaoJulgador?.nome || null,
        juiz: processoRPA?.juiz || null,
        partes: partes,
        ultima_consulta: new Date().toISOString(),
      }, { onConflict: "tenant_id,numero" });

      if (error) throw error;

      toast.success("Processo adicionado ao monitoramento!");
      onClose();
    } catch (err: any) {
      toast.error(`Erro ao monitorar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-amber-500" />
            Adicionar ao Monitoramento
          </DialogTitle>
          <DialogDescription>
            O processo será salvo sem vínculo de cliente. Você poderá "Aceitar o Caso" quando decidir representar uma das partes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Número */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Processo</p>
            <p className="font-mono text-sm font-semibold">{processoDataJud.numeroProcesso}</p>
            {classeNome && <p className="text-xs text-muted-foreground">{classeNome}</p>}
          </div>

          {/* Partes */}
          {partes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                Partes envolvidas
              </p>
              <div className="space-y-1.5">
                {partes.slice(0, 6).map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{p.nome}</span>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{p.tipo}</Badge>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground italic">
                Você decidirá qual parte representa ao aceitar o caso.
              </p>
            </div>
          )}

          {/* Info situação */}
          {(processoRPA?.situacao_processo || processoRPA?.valor_causa_raw) && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {processoRPA.situacao_processo && (
                <div className="bg-muted/40 rounded p-2">
                  <p className="text-muted-foreground">Situação</p>
                  <p className="font-medium mt-0.5">{processoRPA.situacao_processo}</p>
                </div>
              )}
              {processoRPA.valor_causa_raw && (
                <div className="bg-green-50 dark:bg-green-950/20 rounded p-2 border border-green-200 dark:border-green-800">
                  <p className="text-muted-foreground">Valor da Causa</p>
                  <p className="font-medium text-green-700 dark:text-green-400 mt-0.5">{processoRPA.valor_causa_raw}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            onClick={handleMonitorar}
            disabled={loading}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {loading
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Eye className="w-4 h-4 mr-2" />}
            Monitorar Processo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
