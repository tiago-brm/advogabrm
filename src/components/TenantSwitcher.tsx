import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, ArrowLeftRight, CornerUpLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant, type Tenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

const STORAGE_KEY = "brm_superadmin_original_tenant_id";

export function TenantSwitcher() {
  const { role, realTenant, isPreviewMode, previewTenant, refreshTenant } = useTenant();
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");   // tenant escolhido no dropdown
  const [switching, setSwitching] = useState(false);
  const [isFullSwitch, setIsFullSwitch] = useState(false);

  useEffect(() => {
    if (role !== "SUPER_ADMIN") return;
    supabase
      .from("tenants")
      .select("id, nome, logo_url, logo_url_dark, primary_color_hex")
      .order("nome")
      .then(({ data, error }) => {
        if (error) { console.error("TenantSwitcher: erro ao buscar tenants", error); return; }
        if (data) setAllTenants(data as Tenant[]);
      });

    // Só considera full-switch ativo se a chave está no localStorage
    // E o tenant atual no banco é realmente diferente do original
    const storedOriginal = localStorage.getItem(STORAGE_KEY);
    if (storedOriginal) setIsFullSwitch(true);
  }, [role]);

  // Inicializa seleção com o tenant real
  useEffect(() => {
    if (realTenant && !selectedId) setSelectedId(realTenant.id);
  }, [realTenant]);

  if (role !== "SUPER_ADMIN" || allTenants.length <= 1) return null;

  const isSameAsReal = selectedId === realTenant?.id;
  const originalTenantId = localStorage.getItem(STORAGE_KEY) ?? realTenant?.id;

  // ── Seleção no dropdown — só muda estado local ────────────────
  function handleDropdownChange(id: string) {
    setSelectedId(id);
    // Se já estava em preview, atualiza o preview imediatamente
    if (isPreviewMode) {
      const t = allTenants.find((t) => t.id === id);
      previewTenant(t?.id === realTenant?.id ? null : t ?? null);
    }
  }

  // ── Preview visual apenas ─────────────────────────────────────
  function handlePreview() {
    if (isSameAsReal) { previewTenant(null); return; }
    const t = allTenants.find((t) => t.id === selectedId);
    if (t) previewTenant(t);
  }

  async function handleFullSwitch() {
    if (isSameAsReal || switching) return;
    setSwitching(true);
    try {
      const { error } = await supabase.rpc("superadmin_switch_tenant", {
        target_tenant_id: selectedId,
      });
      if (error) throw error;

      // Salva o tenant original APENAS após sucesso do RPC
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, realTenant!.id);
      }
      setIsFullSwitch(true);
      previewTenant(null);
      await refreshTenant();
      const nome = allTenants.find((t) => t.id === selectedId)?.nome;
      toast.success(`Acessando: ${nome}`);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSwitching(false);
    }
  }

  // ── Voltar ao tenant original ─────────────────────────────────
  async function handleReturn() {
    const originalId = localStorage.getItem(STORAGE_KEY);
    if (!originalId || switching) return;
    setSwitching(true);
    try {
      const { error } = await supabase.rpc("superadmin_switch_tenant", {
        target_tenant_id: originalId,
      });
      if (error) throw error;
      localStorage.removeItem(STORAGE_KEY);
      setIsFullSwitch(false);
      setSelectedId(originalId);
      previewTenant(null);
      await refreshTenant();
      toast.success("Voltou ao seu escritório.");
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="space-y-1.5 mt-1">
      {/* Badge de status */}
      {isFullSwitch && (
        <div className="flex items-center justify-between">
          <Badge className="text-[10px] bg-orange-500/15 text-orange-600 border-orange-400">
            <ArrowLeftRight className="w-3 h-3 mr-1" /> Acessando escritório
          </Badge>
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1" onClick={handleReturn} disabled={switching}>
            {switching ? <Loader2 className="w-3 h-3 animate-spin" /> : <CornerUpLeft className="w-3 h-3 mr-1" />}
            Sair
          </Button>
        </div>
      )}
      {isPreviewMode && !isFullSwitch && (
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <Eye className="w-3 h-3 mr-1" /> Modo visual
          </Badge>
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1" onClick={() => { previewTenant(null); setSelectedId(realTenant?.id ?? ""); }}>
            <CornerUpLeft className="w-3 h-3 mr-1" /> Sair
          </Button>
        </div>
      )}

      {/* Dropdown */}
      <Select value={selectedId} onValueChange={handleDropdownChange} disabled={switching}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Selecionar escritório..." />
        </SelectTrigger>
        <SelectContent>
          {allTenants.map((t) => (
            <SelectItem key={t.id} value={t.id} className="text-xs">
              {t.id === (originalTenantId) ? `⭐ ${t.nome}` : t.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Botões de ação */}
      {!isFullSwitch && (
        <div className="flex gap-1">
          <Button
            size="sm" variant="outline"
            className="flex-1 h-7 text-[10px]"
            onClick={handlePreview}
            disabled={isSameAsReal || switching}
            title="Visualiza branding (cores/logo) sem trocar dados"
          >
            <Eye className="w-3 h-3 mr-1" /> Visualizar
          </Button>
          <Button
            size="sm" variant="default"
            className="flex-1 h-7 text-[10px]"
            onClick={handleFullSwitch}
            disabled={isSameAsReal || switching}
            title="Acessa dados reais desse escritório via RLS"
          >
            {switching
              ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
              : <ArrowLeftRight className="w-3 h-3 mr-1" />}
            Acessar
          </Button>
        </div>
      )}
    </div>
  );
}
