import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Hook que retorna o caminho correto da logo baseado no tema atual.
 * 
 * Coloque os arquivos em:
 *   public/logos/logo-light.png  (para tema claro)
 *   public/logos/logo-dark.png   (para tema escuro)
 * 
 * Se o tenant tiver uma logo_url cadastrada no banco, ela tem prioridade sobre as locais.
 */
export function useLogo(tenantLogoUrl?: string | null) {
  const { resolvedTheme } = useTheme();
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  useEffect(() => {
    // Logo do tenant cadastrada no banco tem prioridade máxima
    if (tenantLogoUrl) {
      setLogoSrc(tenantLogoUrl);
      return;
    }

    // Logos locais baseadas no tema
    if (resolvedTheme === "dark") {
      setLogoSrc("/logos/logo-dark.png");
    } else {
      setLogoSrc("/logos/logo-light.png");
    }
  }, [resolvedTheme, tenantLogoUrl]);

  return logoSrc;
}
