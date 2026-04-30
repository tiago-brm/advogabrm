-- ============================================================
-- Patch 007: Tabela de Monitoramento de Processos
-- Processos observados sem vínculo de cliente ainda
-- ============================================================

CREATE TABLE IF NOT EXISTS public.monitoramento_processos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    numero TEXT NOT NULL,
    tribunal TEXT,
    -- Snapshots dos dados enriquecidos
    dados_datajud JSONB DEFAULT '{}',
    dados_rpa JSONB DEFAULT '{}',
    -- Metadados para listagem rápida (desnormalizado)
    assunto TEXT,
    classe TEXT,
    situacao TEXT,
    valor_causa NUMERIC(14,2),
    vara TEXT,
    juiz TEXT,
    partes JSONB DEFAULT '[]',
    -- Controle
    ultima_consulta TIMESTAMPTZ DEFAULT now(),
    convertido_em UUID REFERENCES public.processos(id), -- preenchido ao aceitar o caso
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, numero) -- um processo por tenant
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_monitoramento_tenant ON public.monitoramento_processos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_monitoramento_user ON public.monitoramento_processos(user_id);
CREATE INDEX IF NOT EXISTS idx_monitoramento_numero ON public.monitoramento_processos(numero);

-- RLS
ALTER TABLE public.monitoramento_processos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='monitoramento_processos' AND policyname='monitoramento_tenant_rls') THEN
    CREATE POLICY "monitoramento_tenant_rls" ON public.monitoramento_processos
      FOR ALL USING (
        tenant_id = public.get_auth_tenant_id()
        OR public.get_auth_role() = 'SUPER_ADMIN'
      );
  END IF;
END $$;
