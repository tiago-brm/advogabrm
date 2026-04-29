import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, ArrowLeftRight, CornerUpLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant, type Tenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

const STORAGE_KEY = "brm_superadmin_original_tenant_id";

/**
 * TenantSwitcher — exclusivo para SUPER_ADMIN.
 *
 * Dois modos:
 * 1. "Visualizar" (preview): troca apenas branding (cores/logo) no frontend.
 * 2. "Acessar" (switch completo): atualiza profiles.tenant_id no banco
 *    → RLS filtra dados reais daquele escritório (processos, clientes, etc.)
 *    → Salva o tenant original no localStorage para poder voltar.
 */
export function TenantSwitcher() {
  const { role, realTenant, tenant, isPreviewMode, previewTenant, refreshTenant } = useTenant();
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [switching, setSwitching] = useState(false);
  const [isFullSwitch, setIsFullSwitch] = useState(false);

  useEffect(() => {
    if (role !== "SUPER_ADMIN") return;
    supabase
      .from("tenants")
      .select("id, nome, logo_url, logo_url_dark, primary_color_hex")
      .order("nome")
      .then(({ data }) => { if (data) setAllTenants(data as Tenant[]); });

    // Verifica se há uma sessão de switch ativa
    const originalId = localStorage.getItem(STORAGE_KEY);
    if (originalId) setIsFullSwitch(true);
  }, [role]);

  if (role !== "SUPER_ADMIN" || allTenants.length <= 1) return null;

  const originalTenantId = localStorage.getItem(STORAGE_KEY);
  const currentId = tenant?.id ?? "";

  // ── Troca apenas visual (preview) ─────────────────────────────
  function handlePreview(id: string) {
    if (isFullSwitch) return; // durante switch real, não mistura preview
    const selected = allTenants.find((t) => t.id === id);
    if (!selected || selected.id === realTenant?.id) {
      previewTenant(null);
    } else {
      previewTenant(selected);
    }
  }

  // ── Switch completo (dados reais via RLS) ─────────────────────
  async function handleFullSwitch(id: string) {
    if (id === currentId) return;
    setSwitching(true);
    try {
      // Salva o tenant original (uma só vez)
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, realTenant!.id);
      }

      const { error } = await supabase.rpc("superadmin_switch_tenant", {
        target_tenant_id: id,
      });
      if (error) throw error;

      setIsFullSwitch(true);
      previewTenant(null); // limpa qualquer preview visual
      await refreshTenant(); // recarrega contexto com novo tenant
      toast.success(`Acessando escritório: ${allTenants.find((t) => t.id === id)?.nome}`);
    } catch (err: any) {
      toast.error(`Erro ao trocar: ${err.message}`);
    } finally {
      setSwitching(false);
    }
  }

  // ── Volta ao tenant original ──────────────────────────────────
  async function handleReturnToOriginal() {
    const originalId = localStorage.getItem(STORAGE_KEY);
    if (!originalId) return;
    setSwitching(true);
    try {
      const { error } = await supabase.rpc("superadmin_switch_tenant", {
        target_tenant_id: originalId,
      });
      if (error) throw error;
      localStorage.removeItem(STORAGE_KEY);
      setIsFullSwitch(false);
      previewTenant(null);
      await refreshTenant();
      toast.success("Voltou ao seu escritório.");
    } catch (err: any) {
      toast.error(`Erro ao voltar: ${err.message}`);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="space-y-1.5">
      {/* Badges de status */}
      {isFullSwitch && (
        <div className="flex items-center justify-between px-0.5">
          <Badge className="text-[10px] bg-orange-500/15 text-orange-600 border-orange-400">
            <ArrowLeftRight className="w-3 h-3 mr-1" /> Acessando escritório
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-1 text-muted-foreground hover:text-foreground"
            onClick={handleReturnToOriginal}
            disabled={switching}
          >
            {switching ? <Loader2 className="w-3 h-3 animate-spin" /> : <CornerUpLeft className="w-3 h-3 mr-1" />}
            Sair
          </Button>
        </div>
      )}
      {isPreviewMode && !isFullSwitch && (
        <div className="flex items-center justify-between px-0.5">
          <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <Eye className="w-3 h-3 mr-1" /> Visualizando
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-1 text-muted-foreground"
            onClick={() => previewTenant(null)}
          >
            <CornerUpLeft className="w-3 h-3 mr-1" /> Sair
          </Button>
        </div>
      )}

      {/* Seletor */}
      <Select value={currentId} onValueChange={isFullSwitch ? handleFullSwitch : handlePreview}>
        <SelectTrigger className="h-8 text-xs" disabled={switching}>
          {switching
            ? <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Trocando...</span>
            : <SelectValue placeholder="Selecionar escritório..." />}
        </SelectTrigger>
        <SelectContent>
          {allTenants.map((t) => {
            const isOriginal = t.id === originalTenantId || (!originalTenantId && t.id === realTenant?.id);
            return (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {isOriginal ? `⭐ ${t.nome}` : t.nome}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {/* Botões de modo — só quando não está em full-switch */}
      {!isFullSwitch && (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-6 text-[10px] text-muted-foreground"
            title="Visualiza branding (cores/logo) sem trocar dados"
            onClick={() => handlePreview(currentId)}
          >
            <Eye className="w-3 h-3 mr-1" /> Preview
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-6 text-[10px] text-muted-foreground"
            title="Acessa dados reais desse escritório (processos, clientes, etc.)"
            onClick={() => handleFullSwitch(currentId === realTenant?.id ? allTenants.find(t => t.id !== realTenant?.id)?.id ?? "" : currentId)}
            disabled={switching || currentId === realTenant?.id}
          >
            <ArrowLeftRight className="w-3 h-3 mr-1" /> Acessar
          </Button>
        </div>
      )}
    </div>
  );
}
