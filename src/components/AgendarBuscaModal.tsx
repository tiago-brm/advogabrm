import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";

interface AgendarBuscaModalProps {
  tribunal: string;
  dataInicial?: string;
  dataFinal?: string;
  assunto?: string;
}

export function AgendarBuscaModal({ tribunal, dataInicial, dataFinal, assunto }: AgendarBuscaModalProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enviarEmail, setEnviarEmail] = useState(true);
  const [frequenciaDias, setFrequenciaDias] = useState("1");

  async function handleAgendar() {
    if (!user) {
      toast.error("Usuário não autenticado.");
      return;
    }
    if (!tribunal) {
      toast.error("Selecione um tribunal na tela anterior.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("agendamentos_buscas").insert({
        user_id: user.id,
        tribunal,
        data_ajuizamento_inicio: dataInicial || null,
        data_ajuizamento_fim: dataFinal || null,
        assunto: assunto || null,
        enviar_email: enviarEmail,
        frequencia_dias: parseInt(frequenciaDias, 10),
      });

      if (error) throw error;

      toast.success("Busca agendada com sucesso!");
      setOpen(false);
    } catch (err: any) {
      toast.error(`Erro ao agendar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <CalendarClock className="mr-2 h-4 w-4" />
          Agendar esta Busca
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar Busca Automática</DialogTitle>
          <DialogDescription>
            Configure para que o sistema rode esta busca no DataJud periodicamente em segundo plano.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
            <div><strong>Tribunal:</strong> {tribunal || "Nenhum"}</div>
            <div><strong>Assunto:</strong> {assunto || "Nenhum"}</div>
            <div><strong>Data Início:</strong> {dataInicial ? new Date(dataInicial).toLocaleDateString("pt-BR") : "Nenhuma"}</div>
            <div><strong>Data Fim:</strong> {dataFinal ? new Date(dataFinal).toLocaleDateString("pt-BR") : "Nenhuma"}</div>
          </div>
          
          <div className="space-y-2">
            <Label>Repetir a cada (dias)</Label>
            <Input 
              type="number" 
              min="1" 
              value={frequenciaDias} 
              onChange={e => setFrequenciaDias(e.target.value)} 
            />
          </div>

          <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-base">Notificação por E-mail</Label>
              <p className="text-xs text-muted-foreground">
                Enviar os resultados por e-mail após cada execução.
              </p>
            </div>
            <Switch
              checked={enviarEmail}
              onCheckedChange={setEnviarEmail}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Lembre-se de configurar sua conta SMTP na aba Configurações.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleAgendar} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Agendamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
