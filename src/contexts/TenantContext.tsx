import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Tenant = {
  id: string;
  nome: string;
  logo_url: string | null;
  logo_url_dark: string | null;
  primary_color_hex: string | null;
};

type TenantContextType = {
  tenant: Tenant | null;           // tenant sendo exibido (pode ser preview)
  realTenant: Tenant | null;       // tenant real do usuário logado
  role: "SUPER_ADMIN" | "MASTER" | "ADMIN" | "ADVOGADO" | "ESTAGIARIO" | "READONLY" | null;
  loading: boolean;
  isPreviewMode: boolean;
  previewTenant: (t: Tenant | null) => void;
  refreshTenant: () => Promise<void>;
};

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  realTenant: null,
  role: null,
  loading: true,
  isPreviewMode: false,
  previewTenant: () => {},
  refreshTenant: async () => {},
});

function hexToHslString(hex: string): string {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  r /= 255; g /= 255; b /= 255;
  const cmin = Math.min(r, g, b), cmax = Math.max(r, g, b), delta = cmax - cmin;
  let h = 0, s = 0, l = 0;
  if (delta !== 0) {
    if (cmax === r) h = ((g - b) / delta) % 6;
    else if (cmax === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  l = (cmax + cmin) / 2;
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return `${h} ${+(s * 100).toFixed(1)}% ${+(l * 100).toFixed(1)}%`;
}

function applyBranding(t: Tenant | null) {
  if (t?.primary_color_hex) {
    document.documentElement.style.setProperty("--primary", hexToHslString(t.primary_color_hex));
  } else {
    // Restaura a cor padrão
    document.documentElement.style.removeProperty("--primary");
  }
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [realTenant, setRealTenant] = useState<Tenant | null>(null);
  const [overrideTenant, setOverrideTenant] = useState<Tenant | null>(null); // preview
  const [role, setRole] = useState<"SUPER_ADMIN" | "MASTER" | "ADMIN" | "ADVOGADO" | "ESTAGIARIO" | "READONLY" | null>(null);
  const [loading, setLoading] = useState(true);

  // Tenant efetivo = override (preview) ou o real
  const tenant = overrideTenant ?? realTenant;
  const isPreviewMode = overrideTenant !== null;

  const refreshTenant = useCallback(async () => {
    if (!user) {
      setRealTenant(null);
      setRole(null);
      setLoading(false);
      return;
    }
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, tenant_id")
        .eq("id", user.id)
        .single();

      if (profile) {
        setRole(profile.role as any);
        if (profile.tenant_id) {
          const { data: tenantData } = await supabase
            .from("tenants")
            .select("id, nome, logo_url, logo_url_dark, primary_color_hex")
            .eq("id", profile.tenant_id)
            .single();
          if (tenantData) {
            setRealTenant(tenantData as Tenant);
            // Só aplica branding do real se não estiver em preview
            if (!overrideTenant) applyBranding(tenantData as Tenant);
          }
        }
      }
    } catch (err) {
      console.error("TenantContext error:", err);
    } finally {
      setLoading(false);
    }
  }, [user, overrideTenant]);

  useEffect(() => {
    refreshTenant();
  }, [user]);

  // Aplica branding toda vez que o tenant efetivo mudar
  useEffect(() => {
    applyBranding(tenant);
  }, [tenant]);

  const previewTenant = useCallback((t: Tenant | null) => {
    setOverrideTenant(t);
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, realTenant, role, loading, isPreviewMode, previewTenant, refreshTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => useContext(TenantContext);
