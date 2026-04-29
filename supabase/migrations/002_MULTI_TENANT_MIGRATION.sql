-- ============================================================
-- ADVOGA PRO - Migração 2: Multi-Tenant Architecture
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Criar a tabela Tenants
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  logo_url TEXT,
  primary_color_hex TEXT DEFAULT '#2563eb', -- blue-600
  secondary_color_hex TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS em tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 2. Atualizar a tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('SUPER_ADMIN', 'MASTER', 'USER'));

-- 3. Criar um Tenant Padrão para não quebrar os dados existentes
DO $$
DECLARE
  default_tenant_id UUID;
BEGIN
  -- Verificar se já existe um tenant para evitar erros
  IF NOT EXISTS (SELECT 1 FROM public.tenants LIMIT 1) THEN
    INSERT INTO public.tenants (nome) VALUES ('Advoga PRO Default') RETURNING id INTO default_tenant_id;
    
    -- Associar os perfis existentes ao tenant padrão e dar a eles o papel MASTER (ou SUPER_ADMIN)
    UPDATE public.profiles SET tenant_id = default_tenant_id, role = 'SUPER_ADMIN';
  END IF;
END $$;

-- Tornar tenant_id not null na profiles? Não, um SUPER_ADMIN pode não ter tenant ou estar global, mas vamos manter simples: todo perfil tem um tenant.
-- Para o SUPER_ADMIN, o tenant dele é o tenant principal dele, mas ele pode ver os outros se quisermos.

-- 4. Adicionar tenant_id em todas as tabelas de negócio
-- Tabela Clientes
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
-- Atribuir os clientes atuais ao tenant de seu respectivo user_id
UPDATE public.clientes SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE profiles.id = clientes.user_id) WHERE tenant_id IS NULL;

-- Tabela Processos
ALTER TABLE public.processos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.processos SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE profiles.id = processos.user_id) WHERE tenant_id IS NULL;

-- Tabela Honorarios
ALTER TABLE public.honorarios ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.honorarios SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE profiles.id = honorarios.user_id) WHERE tenant_id IS NULL;

-- Tabela Andamentos
ALTER TABLE public.andamentos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
-- Andamentos não tem user_id diretamente, pegamos do processo
UPDATE public.andamentos SET tenant_id = (SELECT tenant_id FROM public.processos WHERE processos.id = andamentos.processo_id) WHERE tenant_id IS NULL;

-- Tabela agendamentos_buscas
ALTER TABLE public.agendamentos_buscas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.agendamentos_buscas SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE profiles.id = agendamentos_buscas.user_id) WHERE tenant_id IS NULL;

-- Tabela user_smtp_configs
-- Como SMTP geralmente é por usuário e não por tenant (ou o tenant usa um geral), 
-- manteremos focado no usuário, mas também podemos atrelar ao tenant
ALTER TABLE public.user_smtp_configs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.user_smtp_configs SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE profiles.id = user_smtp_configs.user_id) WHERE tenant_id IS NULL;

-- Tabela message_templates
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.message_templates SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE profiles.id = message_templates.user_id) WHERE tenant_id IS NULL;

-- Criar a função auxiliar para checar o tenant atual para performance no RLS
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id() RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_auth_role() RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5. Atualizar as Políticas RLS
-- ==========================================

-- Tenants
DROP POLICY IF EXISTS "Users can view their own tenant" ON public.tenants;
CREATE POLICY "Users can view their own tenant" ON public.tenants 
  FOR SELECT USING (id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

DROP POLICY IF EXISTS "MASTER can update their tenant" ON public.tenants;
CREATE POLICY "MASTER can update their tenant" ON public.tenants 
  FOR UPDATE USING (
    (id = public.get_auth_tenant_id() AND public.get_auth_role() = 'MASTER') OR 
    public.get_auth_role() = 'SUPER_ADMIN'
  );

DROP POLICY IF EXISTS "SUPER_ADMIN can insert tenants" ON public.tenants;
CREATE POLICY "SUPER_ADMIN can insert tenants" ON public.tenants 
  FOR INSERT WITH CHECK (public.get_auth_role() = 'SUPER_ADMIN');

-- Profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON public.profiles;

CREATE POLICY "Users can view profiles in their tenant" ON public.profiles
  FOR SELECT USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.get_auth_role() = 'SUPER_ADMIN');

CREATE POLICY "SUPER_ADMIN and MASTER can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id OR 
    public.get_auth_role() = 'SUPER_ADMIN' OR
    (public.get_auth_role() = 'MASTER' AND tenant_id = public.get_auth_tenant_id())
  );

-- Helper script for dynamic policy creation (simpler to read, but we'll do it explicitly for safety)
-- Clientes
DROP POLICY IF EXISTS "Users can manage their own clients" ON public.clientes;
DROP POLICY IF EXISTS "Tenant users can manage clients" ON public.clientes;
CREATE POLICY "Tenant users can manage clients" ON public.clientes
  FOR ALL USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- Processos
DROP POLICY IF EXISTS "Users can manage their own processes" ON public.processos;
DROP POLICY IF EXISTS "Tenant users can manage processes" ON public.processos;
CREATE POLICY "Tenant users can manage processes" ON public.processos
  FOR ALL USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- Andamentos
DROP POLICY IF EXISTS "Users can manage their own andamentos" ON public.andamentos;
DROP POLICY IF EXISTS "Tenant users can manage andamentos" ON public.andamentos;
CREATE POLICY "Tenant users can manage andamentos" ON public.andamentos
  FOR ALL USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- Honorarios
DROP POLICY IF EXISTS "Users can manage their own honorarios" ON public.honorarios;
DROP POLICY IF EXISTS "Tenant users can manage honorarios" ON public.honorarios;
CREATE POLICY "Tenant users can manage honorarios" ON public.honorarios
  FOR ALL USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- Agendamentos Buscas
DROP POLICY IF EXISTS "Users can view their own agendamentos" ON public.agendamentos_buscas;
DROP POLICY IF EXISTS "Users can insert their own agendamentos" ON public.agendamentos_buscas;
DROP POLICY IF EXISTS "Users can update their own agendamentos" ON public.agendamentos_buscas;
DROP POLICY IF EXISTS "Users can delete their own agendamentos" ON public.agendamentos_buscas;
DROP POLICY IF EXISTS "Tenant users can manage agendamentos" ON public.agendamentos_buscas;
CREATE POLICY "Tenant users can manage agendamentos" ON public.agendamentos_buscas
  FOR ALL USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- SMTP
DROP POLICY IF EXISTS "Users can view their own SMTP config" ON public.user_smtp_configs;
DROP POLICY IF EXISTS "Users can insert their own SMTP config" ON public.user_smtp_configs;
DROP POLICY IF EXISTS "Users can update their own SMTP config" ON public.user_smtp_configs;
DROP POLICY IF EXISTS "Users can delete their own SMTP config" ON public.user_smtp_configs;
DROP POLICY IF EXISTS "Tenant users can manage smtp" ON public.user_smtp_configs;
CREATE POLICY "Tenant users can manage smtp" ON public.user_smtp_configs
  FOR ALL USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- Message Templates
DROP POLICY IF EXISTS "Users can view their own message templates" ON public.message_templates;
DROP POLICY IF EXISTS "Users can manage their own message templates" ON public.message_templates;
DROP POLICY IF EXISTS "Tenant users can manage templates" ON public.message_templates;
CREATE POLICY "Tenant users can manage templates" ON public.message_templates
  FOR ALL USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- Criação do Bucket de Logos
INSERT INTO storage.buckets (id, name, public) VALUES ('tenant_assets', 'tenant_assets', true) ON CONFLICT (id) DO NOTHING;

-- Storage Policies for Logos
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;
CREATE POLICY "Anyone can view logos" ON storage.objects FOR SELECT USING (bucket_id = 'tenant_assets');

DROP POLICY IF EXISTS "MASTER and SUPER_ADMIN can upload logos" ON storage.objects;
CREATE POLICY "MASTER and SUPER_ADMIN can upload logos" ON storage.objects 
  FOR INSERT WITH CHECK (
    bucket_id = 'tenant_assets' AND 
    (public.get_auth_role() = 'MASTER' OR public.get_auth_role() = 'SUPER_ADMIN')
  );

DROP POLICY IF EXISTS "MASTER and SUPER_ADMIN can update logos" ON storage.objects;
CREATE POLICY "MASTER and SUPER_ADMIN can update logos" ON storage.objects 
  FOR UPDATE USING (
    bucket_id = 'tenant_assets' AND 
    (public.get_auth_role() = 'MASTER' OR public.get_auth_role() = 'SUPER_ADMIN')
  );
