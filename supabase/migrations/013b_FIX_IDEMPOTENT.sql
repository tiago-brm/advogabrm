-- ============================================================
-- 013b: Correção completa e idempotente da migration 013
-- Pode ser rodada quantas vezes quiser sem erro.
-- Inclui tudo que a 013 deixou de executar após falha no DO block.
-- ============================================================

-- ─── 1. Funções de roles (idempotente via CREATE OR REPLACE) ──

CREATE OR REPLACE FUNCTION public.role_level(r TEXT) RETURNS INTEGER AS $$
  SELECT CASE r
    WHEN 'SUPER_ADMIN' THEN 100
    WHEN 'MASTER'      THEN  80
    WHEN 'ADMIN'       THEN  60
    WHEN 'ADVOGADO'    THEN  40
    WHEN 'ESTAGIARIO'  THEN  20
    WHEN 'READONLY'    THEN  10
    ELSE 0
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.enforce_default_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id = auth.uid() THEN
    NEW.role := 'READONLY';
    NEW.tenant_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id != auth.uid() THEN RETURN NEW; END IF;
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar seu próprio papel.';
  END IF;
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     AND public.role_level(OLD.role) < 100 THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar seu próprio tenant.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.protect_role_assignment()
RETURNS TRIGGER AS $$
DECLARE
  actor_role  TEXT;
  actor_level INTEGER;
  new_level   INTEGER;
BEGIN
  IF current_setting('role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.id = auth.uid() THEN RETURN NEW; END IF;

  actor_role  := public.get_auth_role();
  actor_level := public.role_level(actor_role);
  new_level   := public.role_level(NEW.role);

  IF new_level >= actor_level THEN
    RAISE EXCEPTION 'Não é permitido atribuir um papel igual ou superior ao seu (você: %, tentativa: %).',
      actor_role, NEW.role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_role_assignment ON public.profiles;
CREATE TRIGGER protect_role_assignment
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_assignment();

-- ─── 2. Triggers set_tenant_id (corrigido: um EXECUTE por statement) ──

CREATE OR REPLACE FUNCTION public.set_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.get_auth_tenant_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','processos','financeiro_lancamentos','audiencias',
    'tarefas','documentos','equipe','agendamentos_buscas',
    'user_smtp_configs','message_templates','user_llm_configs',
    'cliente_interacoes','checklist_templates','rpa_tasks',
    'rpa_enriquecimento_cache'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id ON public.%I', t);
      EXECUTE format('
        CREATE TRIGGER set_tenant_id
          BEFORE INSERT ON public.%I
          FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id()
      ', t);
    END IF;
  END LOOP;
END $$;

-- ─── 3. Adicionar tenant_id onde faltava ─────────────────────

ALTER TABLE public.user_llm_configs
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.user_llm_configs
  SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = user_llm_configs.user_id)
  WHERE tenant_id IS NULL;

ALTER TABLE public.cliente_interacoes
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.cliente_interacoes
  SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = cliente_interacoes.user_id)
  WHERE tenant_id IS NULL;

ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.checklist_templates
  SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = checklist_templates.user_id)
  WHERE tenant_id IS NULL AND user_id IS NOT NULL;

-- ─── 4. Enriquecer tabela equipe ──────────────────────────────

ALTER TABLE public.equipe
  ADD COLUMN IF NOT EXISTS profile_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nivel_acesso  TEXT DEFAULT 'READONLY'
    CHECK (nivel_acesso IN ('ADMIN','ADVOGADO','ESTAGIARIO','READONLY')),
  ADD COLUMN IF NOT EXISTS pode_assinar  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cpf           TEXT,
  ADD COLUMN IF NOT EXISTS oab           TEXT,
  ADD COLUMN IF NOT EXISTS oab_uf        TEXT,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS whatsapp      TEXT,
  ADD COLUMN IF NOT EXISTS tipo_contrato TEXT
    CHECK (tipo_contrato IN ('CLT','PJ','Estágio','Freelancer')),
  ADD COLUMN IF NOT EXISTS cep           TEXT,
  ADD COLUMN IF NOT EXISTS logradouro    TEXT,
  ADD COLUMN IF NOT EXISTS numero        TEXT,
  ADD COLUMN IF NOT EXISTS complemento   TEXT,
  ADD COLUMN IF NOT EXISTS bairro        TEXT,
  ADD COLUMN IF NOT EXISTS cidade        TEXT,
  ADD COLUMN IF NOT EXISTS estado        TEXT;

CREATE OR REPLACE FUNCTION public.validate_equipe_profile_tenant()
RETURNS TRIGGER AS $$
DECLARE
  profile_tenant UUID;
BEGIN
  IF NEW.profile_id IS NULL THEN RETURN NEW; END IF;

  SELECT tenant_id INTO profile_tenant
  FROM public.profiles WHERE id = NEW.profile_id;

  IF profile_tenant IS NOT NULL AND profile_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'O usuário não pertence ao mesmo tenant do escritório.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS validate_equipe_profile_tenant ON public.equipe;
CREATE TRIGGER validate_equipe_profile_tenant
  BEFORE INSERT OR UPDATE OF profile_id ON public.equipe
  FOR EACH ROW EXECUTE FUNCTION public.validate_equipe_profile_tenant();

CREATE OR REPLACE VIEW public.equipe_public AS
  SELECT id, user_id, tenant_id, profile_id, nivel_acesso, pode_assinar,
         nome, email, telefone, whatsapp, cargo, departamento,
         cpf, oab, oab_uf, data_nascimento, tipo_contrato,
         cep, logradouro, numero, complemento, bairro, cidade, estado,
         endereco, observacoes, foto_url, status, data_admissao,
         created_at, updated_at
  FROM public.equipe;

-- ─── 5. Políticas cliente_interacoes (idempotente) ────────────

DROP POLICY IF EXISTS "cliente_interacoes: leitura própria"  ON public.cliente_interacoes;
DROP POLICY IF EXISTS "cliente_interacoes: inserção própria" ON public.cliente_interacoes;
DROP POLICY IF EXISTS "cliente_interacoes: exclusão própria" ON public.cliente_interacoes;
DROP POLICY IF EXISTS "interacoes:select"                    ON public.cliente_interacoes;
DROP POLICY IF EXISTS "interacoes:insert"                    ON public.cliente_interacoes;
DROP POLICY IF EXISTS "interacoes:delete"                    ON public.cliente_interacoes;

CREATE POLICY "interacoes:select" ON public.cliente_interacoes FOR SELECT
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "interacoes:insert" ON public.cliente_interacoes FOR INSERT
  WITH CHECK ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "interacoes:delete" ON public.cliente_interacoes FOR DELETE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');

-- ─── 6. Demais políticas (DROP ambos os nomes antes de criar) ──

-- processos
DROP POLICY IF EXISTS "Tenant users can manage processes" ON public.processos;
DROP POLICY IF EXISTS "processos:select" ON public.processos;
DROP POLICY IF EXISTS "processos:insert" ON public.processos;
DROP POLICY IF EXISTS "processos:update" ON public.processos;
DROP POLICY IF EXISTS "processos:delete" ON public.processos;
CREATE POLICY "processos:select" ON public.processos FOR SELECT
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "processos:insert" ON public.processos FOR INSERT
  WITH CHECK ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "processos:update" ON public.processos FOR UPDATE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "processos:delete" ON public.processos FOR DELETE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');

-- clientes
DROP POLICY IF EXISTS "Tenant users can manage clients" ON public.clientes;
DROP POLICY IF EXISTS "clientes:select" ON public.clientes;
DROP POLICY IF EXISTS "clientes:insert" ON public.clientes;
DROP POLICY IF EXISTS "clientes:update" ON public.clientes;
DROP POLICY IF EXISTS "clientes:delete" ON public.clientes;
CREATE POLICY "clientes:select" ON public.clientes FOR SELECT
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "clientes:insert" ON public.clientes FOR INSERT
  WITH CHECK ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "clientes:update" ON public.clientes FOR UPDATE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "clientes:delete" ON public.clientes FOR DELETE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');

-- financeiro
DROP POLICY IF EXISTS "Tenant users can manage financeiro" ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS "financeiro:select" ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS "financeiro:insert" ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS "financeiro:update" ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS "financeiro:delete" ON public.financeiro_lancamentos;
CREATE POLICY "financeiro:select" ON public.financeiro_lancamentos FOR SELECT
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "financeiro:insert" ON public.financeiro_lancamentos FOR INSERT
  WITH CHECK ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "financeiro:update" ON public.financeiro_lancamentos FOR UPDATE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "financeiro:delete" ON public.financeiro_lancamentos FOR DELETE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');

-- equipe
DROP POLICY IF EXISTS "Tenant users can manage equipe"   ON public.equipe;
DROP POLICY IF EXISTS "Users can view own team members"   ON public.equipe;
DROP POLICY IF EXISTS "Users can insert own team members" ON public.equipe;
DROP POLICY IF EXISTS "Users can update own team members" ON public.equipe;
DROP POLICY IF EXISTS "Users can delete own team members" ON public.equipe;
DROP POLICY IF EXISTS "equipe:select" ON public.equipe;
DROP POLICY IF EXISTS "equipe:insert" ON public.equipe;
DROP POLICY IF EXISTS "equipe:update" ON public.equipe;
DROP POLICY IF EXISTS "equipe:delete" ON public.equipe;
CREATE POLICY "equipe:select" ON public.equipe FOR SELECT
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "equipe:insert" ON public.equipe FOR INSERT
  WITH CHECK ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "equipe:update" ON public.equipe FOR UPDATE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "equipe:delete" ON public.equipe FOR DELETE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 80) OR public.get_auth_role() = 'SUPER_ADMIN');

-- documentos
DROP POLICY IF EXISTS "Tenant users can manage documentos" ON public.documentos;
DROP POLICY IF EXISTS "documentos:select" ON public.documentos;
DROP POLICY IF EXISTS "documentos:insert" ON public.documentos;
DROP POLICY IF EXISTS "documentos:update" ON public.documentos;
DROP POLICY IF EXISTS "documentos:delete" ON public.documentos;
CREATE POLICY "documentos:select" ON public.documentos FOR SELECT
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "documentos:insert" ON public.documentos FOR INSERT
  WITH CHECK ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "documentos:update" ON public.documentos FOR UPDATE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "documentos:delete" ON public.documentos FOR DELETE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');

-- tarefas
DROP POLICY IF EXISTS "Tenant users can manage tarefas" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas:select" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas:insert" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas:update" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas:delete" ON public.tarefas;
CREATE POLICY "tarefas:select" ON public.tarefas FOR SELECT
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "tarefas:insert" ON public.tarefas FOR INSERT
  WITH CHECK ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 20) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "tarefas:update" ON public.tarefas FOR UPDATE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 20) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "tarefas:delete" ON public.tarefas FOR DELETE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');

-- audiencias
DROP POLICY IF EXISTS "Tenant users can manage audiencias" ON public.audiencias;
DROP POLICY IF EXISTS "audiencias:select" ON public.audiencias;
DROP POLICY IF EXISTS "audiencias:insert" ON public.audiencias;
DROP POLICY IF EXISTS "audiencias:update" ON public.audiencias;
DROP POLICY IF EXISTS "audiencias:delete" ON public.audiencias;
CREATE POLICY "audiencias:select" ON public.audiencias FOR SELECT
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "audiencias:insert" ON public.audiencias FOR INSERT
  WITH CHECK ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "audiencias:update" ON public.audiencias FOR UPDATE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "audiencias:delete" ON public.audiencias FOR DELETE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');

-- llm_configs
DROP POLICY IF EXISTS "user_llm_configs: leitura"    ON public.user_llm_configs;
DROP POLICY IF EXISTS "user_llm_configs: escrita"     ON public.user_llm_configs;
DROP POLICY IF EXISTS "user_llm_configs: atualização" ON public.user_llm_configs;
DROP POLICY IF EXISTS "llm_configs:all"               ON public.user_llm_configs;
CREATE POLICY "llm_configs:all" ON public.user_llm_configs FOR ALL
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');

-- audit_log
DROP POLICY IF EXISTS "SUPER_ADMIN can read audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "MASTER+ can read audit_log"     ON public.audit_log;
DROP POLICY IF EXISTS "audit_log:select"               ON public.audit_log;
CREATE POLICY "audit_log:select" ON public.audit_log FOR SELECT
  USING (
    (tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 80)
    OR public.get_auth_role() = 'SUPER_ADMIN'
  );
