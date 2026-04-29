import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant, type Tenant } from "@/contexts/TenantContext";

/**
 * Seletor de tenant para SUPER_ADMIN.
 * Permite alternar entre escritórios em tempo real (modo de visualização/preview).
 * Não altera nada no banco — é puramente um override de contexto.
 */
export function TenantSwitcher() {
  const { role, realTenant, tenant, isPreviewMode, previewTenant } = useTenant();
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    if (role !== "SUPER_ADMIN") return;
    supabase
      .from("tenants")
      .select("id, nome, logo_url, logo_url_dark, primary_color_hex")
      .order("nome")
      .then(({ data }) => {
        if (data) setAllTenants(data as Tenant[]);
      });
  }, [role]);

  if (role !== "SUPER_ADMIN" || allTenants.length <= 1) return null;

  function handleChange(id: string) {
    const selected = allTenants.find((t) => t.id === id);
    if (!selected || selected.id === realTenant?.id) {
      previewTenant(null); // sai do preview
    } else {
      previewTenant(selected);
    }
  }

  return (
    <div className="space-y-1.5">
      {isPreviewMode && (
        <div className="flex items-center justify-between px-1">
          <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <Eye className="w-3 h-3 mr-1" /> Visualizando
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-1 text-muted-foreground"
            onClick={() => previewTenant(null)}
          >
            <EyeOff className="w-3 h-3 mr-1" /> Voltar ao meu
          </Button>
        </div>
      )}

      <Select
        value={tenant?.id ?? ""}
        onValueChange={handleChange}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Selecionar escritório..." />
        </SelectTrigger>
        <SelectContent>
          {allTenants.map((t) => (
            <SelectItem key={t.id} value={t.id} className="text-xs">
              {t.id === realTenant?.id ? `⭐ ${t.nome}` : t.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
