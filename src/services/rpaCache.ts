import { supabase } from "@/integrations/supabase/client";
import type { ResultadoRPA } from "./rpaService";
import { formatarNumeroCNJ } from "./rpaService";

const TTL_DIAS = 10;

function cnj(numero: string): string {
  return formatarNumeroCNJ(numero);
}

export interface CacheEntry {
  resultado: ResultadoRPA;
  cachedAt: string;
  diasAtras: number;
}

// tenant_id é NOT NULL — precisa ser incluído no upsert
async function getTenantId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  return (data as any)?.tenant_id ?? null;
}

function expiracaoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - TTL_DIAS);
  return d.toISOString();
}

function diasAtras(cachedAt: string): number {
  return Math.floor((Date.now() - new Date(cachedAt).getTime()) / (1000 * 60 * 60 * 24));
}

// Busca resultado cacheado para um processo. Retorna null se não existir ou expirado.
export async function getCachedResultado(numero: string): Promise<CacheEntry | null> {
  const { data, error } = await supabase
    .from("rpa_enriquecimento_cache")
    .select("resultado, cached_at")
    .eq("numero_processo", cnj(numero))
    .gte("cached_at", expiracaoISO())
    .maybeSingle();

  if (error) {
    console.warn("[rpaCache] getCachedResultado error:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    resultado: data.resultado as ResultadoRPA,
    cachedAt: data.cached_at,
    diasAtras: diasAtras(data.cached_at),
  };
}

// Salva (ou atualiza) resultado no cache com tenant_id correto.
export async function setCachedResultado(
  numero: string,
  tribunal: string,
  resultado: ResultadoRPA
): Promise<void> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    console.warn("[rpaCache] setCachedResultado: tenant_id não encontrado, cache não salvo.");
    return;
  }

  const { error } = await supabase
    .from("rpa_enriquecimento_cache")
    .upsert(
      {
        tenant_id: tenantId,
        numero_processo: cnj(numero),
        tribunal,
        resultado: resultado as any,
        cached_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,numero_processo" }
    );

  if (error) {
    console.warn("[rpaCache] setCachedResultado error:", error.message);
  }
}

// Dado um array de números, retorna { cached, fresh }.
export async function particionarPorCache(numeros: string[]): Promise<{
  cached: (CacheEntry & { numero: string })[];
  fresh: string[];
}> {
  const cnjs = numeros.map(cnj);

  const { data, error } = await supabase
    .from("rpa_enriquecimento_cache")
    .select("numero_processo, resultado, cached_at")
    .in("numero_processo", cnjs)
    .gte("cached_at", expiracaoISO());

  if (error) {
    console.warn("[rpaCache] particionarPorCache error:", error.message);
    return { cached: [], fresh: numeros };
  }

  const cacheMap = new Map((data ?? []).map((r) => [r.numero_processo, r]));

  const cached: (CacheEntry & { numero: string })[] = [];
  const fresh: string[] = [];

  for (const n of numeros) {
    const hit = cacheMap.get(cnj(n));
    if (hit) {
      cached.push({
        numero: n,
        resultado: hit.resultado as ResultadoRPA,
        cachedAt: hit.cached_at,
        diasAtras: diasAtras(hit.cached_at),
      });
    } else {
      fresh.push(n);
    }
  }

  return { cached, fresh };
}
