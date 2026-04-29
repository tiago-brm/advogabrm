import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Hook que retorna o caminho correto da logo baseado no tema atual.
 *
 * Coloque os arquivos em:
 *   public/logos/logo-light.png  → tema claro
 *   public/logos/logo-dark.png   → tema escuro
 *
 * Se o tenant tiver uma logo_url cadastrada no banco, ela tem prioridade.
 * Retorna null quando nenhum arquivo existe (componentes mostram fallback de texto).
 */
export function useLogo(tenantLogoUrl?: string | null) {
  const { resolvedTheme } = useTheme();
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  useEffect(() => {
    // Logo do tenant tem prioridade máxima
    if (tenantLogoUrl) {
      setLogoSrc(tenantLogoUrl);
      return;
    }

    // Verifica se o arquivo de logo local realmente existe antes de retornar o path
    const path =
      resolvedTheme === "dark"
        ? "/logos/logo-dark.png"
        : "/logos/logo-light.png";

    // Testa se o arquivo existe fazendo um HEAD request silencioso
    fetch(path, { method: "HEAD" })
      .then((res) => {
        if (res.ok) {
          setLogoSrc(path);
        } else {
          setLogoSrc(null); // arquivo não existe → mostra fallback de texto
        }
      })
      .catch(() => setLogoSrc(null));
  }, [resolvedTheme, tenantLogoUrl]);

  return logoSrc;
}
