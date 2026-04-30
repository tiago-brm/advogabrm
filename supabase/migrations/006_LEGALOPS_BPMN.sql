-- ============================================================
-- AdvogaBRM / LegalOps Tech Solutions
-- Patch 006: Criação das tabelas do módulo de orquestração BPMN
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- Tabela de Templates (Desenhos de Fluxo BPMN)
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id), -- NULL = template global
    name TEXT NOT NULL,
    bpmn_xml TEXT NOT NULL,
    form_schema JSONB,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de Instâncias de Processo (Execuções)
CREATE TABLE IF NOT EXISTS public.process_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES public.templates(id),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    external_id TEXT, -- ID na Engine Externa (se usar)
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'SUSPENDED', 'TERMINATED')),
    started_by UUID REFERENCES public.profiles(id),
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Tabela de Tarefas Humanas (User Tasks)
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_instance_id UUID REFERENCES public.process_instances(id),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    external_task_id TEXT,
    name TEXT NOT NULL,
    assignee_id UUID REFERENCES public.profiles(id),
    form_schema JSONB,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED')),
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Habilitar RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Policies: Isolamento de Tenants
-- ------------------------------------------------------------

-- Templates: Admins/Operators veem os templates do seu tenant e os templates globais (tenant_id IS NULL)
CREATE POLICY "tenant_isolation_templates" ON public.templates
  FOR ALL USING (
    tenant_id = public.get_auth_tenant_id()
    OR public.get_auth_role() = 'SUPER_ADMIN'
    OR tenant_id IS NULL
  );

-- Process Instances: Isolado por tenant
CREATE POLICY "tenant_isolation_instances" ON public.process_instances
  FOR ALL USING (
    tenant_id = public.get_auth_tenant_id()
    OR public.get_auth_role() = 'SUPER_ADMIN'
  );

-- Tasks: Isolado por tenant
CREATE POLICY "tenant_isolation_tasks" ON public.tasks
  FOR ALL USING (
    tenant_id = public.get_auth_tenant_id()
    OR public.get_auth_role() = 'SUPER_ADMIN'
  );
