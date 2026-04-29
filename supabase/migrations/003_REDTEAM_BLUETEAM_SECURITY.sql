-- ============================================================
-- AdvogaBRM - Migração 3: Red Team Security Fixes
-- Execute este script no SQL Editor do Supabase
-- Aplica: CRIT-01, HIGH-01, MED-01
-- ============================================================

-- ============================================================
-- [CRIT-01] FIX: Impedir escalação de privilégio via INSERT
-- O campo `role` deve ser sempre definido pelo banco (trigger),
-- nunca pelo cliente da API.
-- ============================================================

-- Trigger que força role = 'USER' em todo auto-insert de signup
CREATE OR REPLACE FUNCTION public.enforce_default_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o INSERT vier da API com um role inválido, força para USER
  -- Somente o service_role (backend) pode definir roles diferentes
  IF NEW.id = auth.uid() THEN
    -- Este insert está sendo feito pelo próprio usuário (signup), não pelo backend
    NEW.role := 'USER';
    NEW.tenant_id := NULL; -- Tenant deve ser atribuído pelo SUPER_ADMIN
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_default_role_on_insert ON public.profiles;
CREATE TRIGGER enforce_default_role_on_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_default_role();

-- Também proibir o usuário de alterar seu próprio role via UPDATE
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o usuário está atualizando seu próprio perfil E tentou mudar o role
  IF NEW.id = auth.uid() AND OLD.role != NEW.role THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar seu próprio role.';
  END IF;
  -- Também não pode mudar seu próprio tenant_id
  IF NEW.id = auth.uid() AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar seu próprio tenant.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS prevent_role_self_escalation_on_update ON public.profiles;
CREATE TRIGGER prevent_role_self_escalation_on_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_escalation();

-- ============================================================
-- [HIGH-01] FIX: Marcar funções como VOLATILE em vez de STABLE
-- Previne cache de valores durante transações longas
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_auth_tenant_id() RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_auth_role() RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- [MED-01] FIX: Restringir tipos de arquivo no bucket tenant_assets
-- Apenas imagens são permitidas (png, jpg, jpeg, svg, webp)
-- ============================================================

-- Remover policy genérica de upload
DROP POLICY IF EXISTS "MASTER and SUPER_ADMIN can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "MASTER and SUPER_ADMIN can update logos" ON storage.objects;

-- Recriar com validação de extensão
CREATE POLICY "MASTER and SUPER_ADMIN can upload logos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'tenant_assets' AND
    (public.get_auth_role() = 'MASTER' OR public.get_auth_role() = 'SUPER_ADMIN') AND
    (
      storage.extension(name) = 'png' OR
      storage.extension(name) = 'jpg' OR
      storage.extension(name) = 'jpeg' OR
      storage.extension(name) = 'svg' OR
      storage.extension(name) = 'webp'
    )
  );

CREATE POLICY "MASTER and SUPER_ADMIN can update logos" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'tenant_assets' AND
    (public.get_auth_role() = 'MASTER' OR public.get_auth_role() = 'SUPER_ADMIN') AND
    (
      storage.extension(name) = 'png' OR
      storage.extension(name) = 'jpg' OR
      storage.extension(name) = 'jpeg' OR
      storage.extension(name) = 'svg' OR
      storage.extension(name) = 'webp'
    )
  );

-- ============================================================
-- [CRIT-02] FIX: Criptografia de senhas SMTP
-- Requer pgcrypto. A chave de criptografia deve ser definida
-- como secret no Supabase Vault ou via env.
-- INSTRUÇÃO: Após criar o registro, criptografe com:
--   UPDATE user_smtp_configs 
--   SET password = encode(encrypt(password::bytea, current_setting('app.smtp_secret')::bytea, 'aes'), 'base64')
--   WHERE user_id = <id>;
-- E leia com:
--   SELECT convert_from(decrypt(decode(password,'base64'), current_setting('app.smtp_secret')::bytea, 'aes'), 'UTF8')
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Adicionar coluna para indicar se a senha está criptografada
ALTER TABLE public.user_smtp_configs 
  ADD COLUMN IF NOT EXISTS password_encrypted BOOLEAN NOT NULL DEFAULT false;

-- NOTA: A migração dos dados existentes (criptografar as senhas que já estão em texto puro)
-- deve ser feita via script de backend com a chave de criptografia configurada,
-- NÃO via SQL direto para evitar exposição da chave no histórico de queries.

-- ============================================================
-- Blue Team: Auditoria - Tabela de audit_log
-- Registra todas as operações críticas no sistema
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  user_id UUID,
  tenant_id UUID,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Somente leitura via API para SUPER_ADMIN
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SUPER_ADMIN can read audit_log" ON public.audit_log
  FOR SELECT USING (public.get_auth_role() = 'SUPER_ADMIN');

-- Função de auditoria
-- Usa JSONB para extrair campos dinamicamente, evitando erro quando
-- a tabela não tem tenant_id (ex: a própria tabela tenants)
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_row      JSONB;
  v_tenant_id UUID;
  v_record_id UUID;
BEGIN
  -- Pega o registro principal dependendo da operação
  v_row := CASE
    WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb
    ELSE row_to_json(NEW)::jsonb
  END;

  -- Extrai tenant_id e id via JSONB (retorna NULL se o campo não existir)
  v_tenant_id := (v_row->>'tenant_id')::UUID;
  v_record_id := (v_row->>'id')::UUID;

  INSERT INTO public.audit_log (
    table_name, operation, user_id, tenant_id,
    record_id, old_data, new_data
  ) VALUES (
    TG_TABLE_NAME,
    TG_OP,
    auth.uid(),
    v_tenant_id,
    v_record_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW)::jsonb ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Aplicar auditoria nas tabelas sensíveis
DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_tenants ON public.tenants;
CREATE TRIGGER audit_tenants
  AFTER INSERT OR UPDATE OR DELETE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_clientes ON public.clientes;
CREATE TRIGGER audit_clientes
  AFTER INSERT OR UPDATE OR DELETE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_processos ON public.processos;
CREATE TRIGGER audit_processos
  AFTER INSERT OR UPDATE OR DELETE ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_smtp ON public.user_smtp_configs;
CREATE TRIGGER audit_smtp
  AFTER INSERT OR UPDATE OR DELETE ON public.user_smtp_configs
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ============================================================
-- Blue Team: Rate Limiting na tabela de agendamentos
-- Previne criação massiva de agendamentos (abuse)
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_agendamento_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  -- Máximo de 20 agendamentos ativos por usuário
  SELECT COUNT(*) INTO recent_count
  FROM public.agendamentos_buscas
  WHERE user_id = NEW.user_id
    AND status = 'Ativo';

  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'Limite de agendamentos ativos atingido (máximo: 20).';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS rate_limit_agendamentos ON public.agendamentos_buscas;
CREATE TRIGGER rate_limit_agendamentos
  BEFORE INSERT ON public.agendamentos_buscas
  FOR EACH ROW EXECUTE FUNCTION public.check_agendamento_rate_limit();
