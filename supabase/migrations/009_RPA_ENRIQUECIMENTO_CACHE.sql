-- ============================================================
-- Patch 009: Cache de Enriquecimento RPA
-- Armazena resultados do RPA por processo/tenant com TTL de 10 dias
-- Se o processo já foi consultado recentemente, retorna o cache
-- sem consumir a API do RPA.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rpa_enriquecimento_cache (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    numero_processo TEXT NOT NULL,          -- formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO
    tribunal        TEXT NOT NULL,
    resultado       JSONB NOT NULL,         -- ResultadoRPA completo
    cached_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, numero_processo)      -- um cache por processo por tenant
);

-- Índices para lookup rápido
CREATE INDEX IF NOT EXISTS idx_rpa_cache_tenant_numero
    ON public.rpa_enriquecimento_cache(tenant_id, numero_processo);

CREATE INDEX IF NOT EXISTS idx_rpa_cache_cached_at
    ON public.rpa_enriquecimento_cache(cached_at);

-- RLS: cada tenant só vê/escreve o próprio cache
ALTER TABLE public.rpa_enriquecimento_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rpa_enriquecimento_cache'
    AND policyname = 'rpa_cache_tenant_rls'
  ) THEN
    CREATE POLICY "rpa_cache_tenant_rls" ON public.rpa_enriquecimento_cache
      FOR ALL USING (
        tenant_id = public.get_auth_tenant_id()
        OR public.get_auth_role() = 'SUPER_ADMIN'
      );
  END IF;
END $$;
