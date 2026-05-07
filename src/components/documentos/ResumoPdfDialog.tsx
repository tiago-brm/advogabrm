import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { summarizePdfWithLlm } from "@/services/llmService";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import type { Documento } from "@/pages/Documentos";

interface Props {
  documento: Documento | null;
  open: boolean;
  onClose: () => void;
}

export function ResumoPdfDialog({ documento, open, onClose }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [resumo, setResumo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleResumir() {
    if (!documento) return;
    setLoading(true);
    setResumo(null);
    try {
      // Baixa o arquivo do Supabase Storage como Blob
      const { data, error } = await supabase.storage
        .from("documentos")
        .download(documento.storagePath);

      if (error || !data) throw new Error("Não foi possível baixar o documento.");

      const { content } = await summarizePdfWithLlm(data);
      setResumo(content);
    } catch (err: any) {
      if (err.message?.includes("Nenhum provedor de IA configurado")) {
        toast.error("IA não configurada", {
          description: "Acesse Configurações para adicionar sua chave de API.",
          action: { label: "Configurar agora", onClick: () => navigate("/configuracoes") },
        });
        onClose();
      } else {
        toast.error("Erro ao resumir documento", { description: err.message });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!resumo) return;
    navigator.clipboard.writeText(resumo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose();
      // Limpa o resultado ao fechar para não exibir resumo de outro documento
      setTimeout(() => setResumo(null), 300);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Resumo com IA
          </DialogTitle>
          <DialogDescription className="truncate text-xs">
            {documento?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {!resumo && !loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-10 text-center text-muted-foreground">
              <Sparkles className="h-10 w-10 text-primary/30" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Pronto para analisar</p>
                <p className="text-xs max-w-xs">
                  A IA vai ler o documento e produzir um resumo com partes, obrigações, prazos e cláusulas de risco.
                </p>
              </div>
              <Button onClick={handleResumir} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Gerar resumo
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Analisando documento...</p>
            </div>
          )}

          {resumo && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-wrap leading-relaxed">
                {resumo}
              </div>
            </div>
          )}
        </div>

        {resumo && (
          <div className="flex justify-between items-center pt-3 border-t shrink-0">
            <Button variant="outline" size="sm" onClick={handleResumir} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Regerar
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado!" : "Copiar resumo"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
