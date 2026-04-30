import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Eye, Search, CheckCircle, RefreshCw, Trash2,
  Building2, DollarSign, Gavel, TrendingUp, Calendar,
  Loader2, User, AlertCircle
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AceitarCasoModal } from "@/components/AceitarCasoModal";
import { MonitoramentoProcesso } from "@/types/monitoramento";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

function formatarData(d?: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return d; }
}

function formatarMoeda(v?: number | null) {
  if (!v) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Card de processo monitorado ─────────────────────────────────────────────
function MonitoramentoCard({
  item,
  onAceitar,
  onRemover,
}: {
  item: MonitoramentoProcesso;
  onAceitar: (item: MonitoramentoProcesso) => void;
  onRemover: (id: string) => void;
}) {
  const jaConvertido = !!item.convertido_em;

  return (
    <Card className={`border-l-4 transition-shadow hover:shadow-md ${jaConvertido ? "border-l-green-400 opacity-60" : "border-l-amber-400"}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="font-mono text-sm font-semibold tracking-tight">{item.numero}</p>
            {item.classe && <p className="text-xs text-muted-foreground mt-0.5">{item.classe}</p>}
          </div>
          <div className="flex items-center gap-2">
            {jaConvertido ? (
              <Badge variant="outline" className="border-green-500 text-green-600 text-xs">
                <CheckCircle className="w-3 h-3 mr-1" /> Caso aceito
              </Badge>
            ) : (
              <Badge className="bg-amber-500 text-white text-xs">
                <Eye className="w-3 h-3 mr-1" /> Monitorando
              </Badge>
            )}
            {item.tribunal && (
              <Badge variant="secondary" className="text-xs uppercase">{item.tribunal}</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Infos */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {item.situacao && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp className="w-3 h-3 shrink-0" />
              <span>{item.situacao}</span>
            </div>
          )}
          {item.vara && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{item.vara}</span>
            </div>
          )}
          {item.juiz && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Gavel className="w-3 h-3 shrink-0" />
              <span className="truncate">{item.juiz}</span>
            </div>
          )}
          {item.valor_causa && (
            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-medium">
              <DollarSign className="w-3 h-3 shrink-0" />
              <span>{formatarMoeda(item.valor_causa)}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="w-3 h-3 shrink-0" />
            <span>Monitorado em {formatarData(item.created_at)}</span>
          </div>
        </div>

        {/* Partes */}
        {item.partes?.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Partes</p>
            <div className="flex flex-wrap gap-1.5">
              {item.partes.slice(0, 4).map((p, i) => (
                <div key={i} className="flex items-center gap-1 text-xs bg-muted/50 rounded px-2 py-0.5">
                  <User className="w-3 h-3 text-muted-foreground" />
                  <span>{p.nome}</span>
                  <span className="text-muted-foreground">({p.tipo})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assunto */}
        {item.assunto && (
          <p className="text-xs text-muted-foreground border-t pt-2">
            <span className="font-medium">Assunto:</span> {item.assunto}
          </p>
        )}

        {/* Ações */}
        {!jaConvertido && (
          <div className="flex items-center gap-2 pt-1 border-t">
            <Button
              size="sm"
              onClick={() => onAceitar(item)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
              Aceitar Caso
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive ml-auto">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover do monitoramento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O processo {item.numero} será removido da lista. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive hover:bg-destructive/90"
                    onClick={() => onRemover(item.id)}
                  >
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function MonitoramentoPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [aceitarItem, setAceitarItem] = useState<MonitoramentoProcesso | null>(null);

  const { data: itens, isLoading, error } = useQuery({
    queryKey: ["monitoramento", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitoramento_processos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as MonitoramentoProcesso[];
    },
    enabled: !!user,
  });

  async function handleRemover(id: string) {
    const { error } = await supabase.from("monitoramento_processos").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover"); return; }
    toast.success("Removido do monitoramento");
    queryClient.invalidateQueries({ queryKey: ["monitoramento"] });
  }

  const filtrados = (itens ?? []).filter((i) =>
    !busca || i.numero.includes(busca) || i.assunto?.toLowerCase().includes(busca.toLowerCase())
  );

  const pendentes = filtrados.filter((i) => !i.convertido_em);
  const convertidos = filtrados.filter((i) => i.convertido_em);

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
          <Eye className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Monitoramento de Processos</h1>
          <p className="text-sm text-muted-foreground">
            Processos em observação — aceite o caso quando decidir representar uma das partes
          </p>
        </div>
        {itens && (
          <Badge className="ml-auto bg-amber-500 text-white">
            {pendentes.length} monitorando
          </Badge>
        )}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por número ou assunto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Estado de carregamento */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Erro ao carregar monitoramento. Execute a migration 007 no Supabase.</AlertDescription>
        </Alert>
      )}

      {/* Pendentes */}
      {pendentes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Em observação ({pendentes.length})
          </h2>
          {pendentes.map((item) => (
            <MonitoramentoCard
              key={item.id}
              item={item}
              onAceitar={setAceitarItem}
              onRemover={handleRemover}
            />
          ))}
        </div>
      )}

      {/* Convertidos */}
      {convertidos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" /> Casos aceitos ({convertidos.length})
          </h2>
          {convertidos.map((item) => (
            <MonitoramentoCard
              key={item.id}
              item={item}
              onAceitar={setAceitarItem}
              onRemover={handleRemover}
            />
          ))}
        </div>
      )}

      {/* Vazio */}
      {!isLoading && !error && filtrados.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Eye className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">Nenhum processo monitorado ainda</p>
          <p className="text-sm mt-1">
            Use a <strong>Consulta de Processos</strong> e clique em "Monitorar" para começar.
          </p>
        </div>
      )}

      {/* Modal aceitar caso */}
      {aceitarItem && (
        <AceitarCasoModal
          open={!!aceitarItem}
          onClose={() => setAceitarItem(null)}
          monitoramento={aceitarItem}
          onConvertido={() => queryClient.invalidateQueries({ queryKey: ["monitoramento"] })}
        />
      )}
    </div>
  );
}
