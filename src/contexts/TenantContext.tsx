import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Tenant = {
  id: string;
  nome: string;
  logo_url: string | null;
  primary_color_hex: string | null;
};

type TenantContextType = {
  tenant: Tenant | null;
  role: "SUPER_ADMIN" | "MASTER" | "USER" | null;
  loading: boolean;
  refreshTenant: () => Promise<void>;
};

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  role: null,
  loading: true,
  refreshTenant: async () => {},
});

// Helper to convert HEX to HSL string "H S% L%" for shadcn
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
  r /= 255;
  g /= 255;
  b /= 255;
  let cmin = Math.min(r, g, b),
      cmax = Math.max(r, g, b),
      delta = cmax - cmin,
      h = 0,
      s = 0,
      l = 0;

  if (delta === 0) h = 0;
  else if (cmax === r) h = ((g - b) / delta) % 6;
  else if (cmax === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  l = (cmax + cmin) / 2;
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  s = +(s * 100).toFixed(1);
  l = +(l * 100).toFixed(1);

  return `${h} ${s}% ${l}%`;
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [role, setRole] = useState<"SUPER_ADMIN" | "MASTER" | "USER" | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshTenant = async () => {
    if (!user) {
      setTenant(null);
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
            .select("*")
            .eq("id", profile.tenant_id)
            .single();
          
          if (tenantData) {
            setTenant(tenantData as Tenant);
            
            // Apply Dynamic Branding
            if (tenantData.primary_color_hex) {
              const hsl = hexToHslString(tenantData.primary_color_hex);
              document.documentElement.style.setProperty("--primary", hsl);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error fetching tenant context", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshTenant();
  }, [user]);

  return (
    <TenantContext.Provider value={{ tenant, role, loading, refreshTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => useContext(TenantContext);
