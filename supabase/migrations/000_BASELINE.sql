-- ============================================================
-- AdvogaBRM — Baseline Completo
-- Script único para novos ambientes (dev, staging, prod virgem).
-- Consolida todas as migrations de 001 até 013b.
-- Idempotente: pode ser rodado em banco zerado sem erro.
-- ============================================================

-- ─── Extensões ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── 1. ENUMS ──────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cliente_status') THEN
    CREATE TYPE public.cliente_status AS ENUM ('Ativo', 'Inativo');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processo_status') THEN
    CREATE TYPE public.processo_status AS ENUM ('Em Andamento', 'Aguardando', 'Concluído');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processo_prioridade') THEN
    CREATE TYPE public.processo_prioridade AS ENUM ('Alta', 'Média', 'Baixa');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audiencia_tipo') THEN
    CREATE TYPE public.audiencia_tipo AS ENUM ('Instrução', 'Conciliação', 'Julgamento', 'Una');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audiencia_status') THEN
    CREATE TYPE public.audiencia_status AS ENUM ('Agendada', 'Realizada', 'Cancelada', 'Reagendada');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tarefa_prioridade') THEN
    CREATE TYPE public.tarefa_prioridade AS ENUM ('Baixa', 'Média', 'Alta');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tarefa_status') THEN
    CREATE TYPE public.tarefa_status AS ENUM ('Pendente', 'Em Andamento', 'Concluída');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lancamento_status') THEN
    CREATE TYPE public.lancamento_status AS ENUM ('Pago', 'Pendente');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_agendamento') THEN
    CREATE TYPE public.status_agendamento AS ENUM ('Ativo', 'Inativo', 'Concluído', 'Falha');
  END IF;
END $$;

-- ─── 2. TABELAS CORE ───────────────────────────────────────────

-- tenants
CREATE TABLE IF NOT EXISTS public.tenants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                TEXT NOT NULL,
  logo_url            TEXT,
  logo_url_dark       TEXT,
  primary_color_hex   TEXT DEFAULT '#2563eb',
  secondary_color_hex TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email           TEXT,
  full_name       TEXT,
  tenant_id       UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  role            TEXT NOT NULL DEFAULT 'READONLY'
    CONSTRAINT profiles_role_check
    CHECK (role IN ('SUPER_ADMIN', 'MASTER', 'ADMIN', 'ADVOGADO', 'ESTAGIARIO', 'READONLY')),
  datajud_api_key TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ─── 3. FUNÇÕES UTILITÁRIAS ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- alias usado por alguns triggers antigos
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── 4. FUNÇÕES DE AUTH / TENANT ──────────────────────────────

CREATE OR REPLACE FUNCTION public.get_auth_tenant_id() RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_auth_role() RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

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

-- Novo usuário → cria profile com role READONLY
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''));
  RETURN NEW;
END;
$$;

-- Impede escalação de privilege no signup
CREATE OR REPLACE FUNCTION public.enforce_default_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.id = auth.uid() THEN
    NEW.role := 'READONLY';
    NEW.tenant_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Impede usuário de mudar o próprio role/tenant
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

-- Impede atribuir role >= o do ator
CREATE OR REPLACE FUNCTION public.protect_role_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

-- Auto-preenche tenant_id nos INSERTs
CREATE OR REPLACE FUNCTION public.set_tenant_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.get_auth_tenant_id();
  END IF;
  RETURN NEW;
END;
$$;

-- Valida que profile_id linkado ao equipe pertence ao mesmo tenant
CREATE OR REPLACE FUNCTION public.validate_equipe_profile_tenant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  profile_tenant UUID;
BEGIN
  IF NEW.profile_id IS NULL THEN RETURN NEW; END IF;
  SELECT tenant_id INTO profile_tenant FROM public.profiles WHERE id = NEW.profile_id;
  IF profile_tenant IS NOT NULL AND profile_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'O usuário não pertence ao mesmo tenant do escritório.';
  END IF;
  RETURN NEW;
END;
$$;

-- SUPER_ADMIN troca de tenant ativo
CREATE OR REPLACE FUNCTION public.superadmin_switch_tenant(target_tenant_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_auth_role() != 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Apenas SUPER_ADMIN pode trocar de tenant.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = target_tenant_id) THEN
    RAISE EXCEPTION 'Tenant não encontrado.';
  END IF;
  UPDATE public.profiles SET tenant_id = target_tenant_id WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.superadmin_switch_tenant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_switch_tenant(UUID) TO authenticated;

-- Auditoria de operações críticas
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row       JSONB;
  v_tenant_id UUID;
  v_record_id UUID;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb ELSE row_to_json(NEW)::jsonb END;
  v_tenant_id := (v_row->>'tenant_id')::UUID;
  v_record_id := (v_row->>'id')::UUID;
  INSERT INTO public.audit_log (table_name, operation, user_id, tenant_id, record_id, old_data, new_data)
  VALUES (
    TG_TABLE_NAME, TG_OP, auth.uid(), v_tenant_id, v_record_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE')  THEN row_to_json(NEW)::jsonb ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Rate limit de agendamentos
CREATE OR REPLACE FUNCTION public.check_agendamento_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.agendamentos_buscas WHERE user_id = NEW.user_id AND status = 'Ativo';
  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'Limite de agendamentos ativos atingido (máximo: 20).';
  END IF;
  RETURN NEW;
END;
$$;

-- Notifica motor BPMN quando task é concluída
CREATE OR REPLACE FUNCTION public.handle_task_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
    PERFORM pg_notify('bpmn_task_completed', json_build_object(
      'task_id',             NEW.id,
      'process_instance_id', NEW.process_instance_id,
      'tenant_id',           NEW.tenant_id,
      'task_type',           NEW.task_type,
      'rpa_queue',           NEW.rpa_queue,
      'rpa_result',          NEW.rpa_result,
      'completed_at',        now()
    )::text);
    IF NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 5. TRIGGERS DE PROFILES ──────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS enforce_default_role_on_insert ON public.profiles;
CREATE TRIGGER enforce_default_role_on_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_default_role();

DROP TRIGGER IF EXISTS prevent_role_self_escalation_on_update ON public.profiles;
CREATE TRIGGER prevent_role_self_escalation_on_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_escalation();

DROP TRIGGER IF EXISTS protect_role_assignment ON public.profiles;
CREATE TRIGGER protect_role_assignment
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_assignment();

DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_tenants ON public.tenants;
CREATE TRIGGER audit_tenants
  AFTER INSERT OR UPDATE OR DELETE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ─── 6. TABELAS DE NEGÓCIO ─────────────────────────────────────

-- clientes (com campos CRM da 012)
CREATE TABLE IF NOT EXISTS public.clientes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id            UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome                 TEXT NOT NULL,
  email                TEXT NOT NULL,
  telefone             TEXT,
  telefone_secundario  TEXT,
  whatsapp             TEXT,
  tipo_pessoa          TEXT NOT NULL DEFAULT 'PF' CHECK (tipo_pessoa IN ('PF', 'PJ')),
  cpf_cnpj             TEXT,
  rg                   TEXT,
  razao_social         TEXT,
  data_nascimento      DATE,
  profissao            TEXT,
  origem               TEXT CHECK (origem IN ('Indicação', 'Site', 'Evento', 'Redes Sociais', 'Outro')),
  cep                  TEXT,
  logradouro           TEXT,
  numero               TEXT,
  complemento          TEXT,
  bairro               TEXT,
  cidade               TEXT,
  estado               TEXT,
  endereco             TEXT,
  observacoes          TEXT,
  data_registro        DATE NOT NULL DEFAULT (now()::date),
  processos_ativos     INTEGER NOT NULL DEFAULT 0 CHECK (processos_ativos >= 0),
  status               public.cliente_status NOT NULL DEFAULT 'Ativo',
  ultimo_contato       DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_client_email_per_user UNIQUE (user_id, email)
);
CREATE INDEX IF NOT EXISTS idx_clientes_user_id    ON public.clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_clientes_tenant_id  ON public.clientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_user_nome  ON public.clientes(user_id, nome);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_clientes_updated_at ON public.clientes;
CREATE TRIGGER update_clientes_updated_at
  BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_tenant_id ON public.clientes;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
DROP TRIGGER IF EXISTS audit_clientes ON public.clientes;
CREATE TRIGGER audit_clientes
  AFTER INSERT OR UPDATE OR DELETE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- processos
CREATE TABLE IF NOT EXISTS public.processos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id    UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id   UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  numero       TEXT NOT NULL,
  assunto      TEXT NOT NULL,
  status       public.processo_status NOT NULL DEFAULT 'Em Andamento',
  data_inicio  DATE NOT NULL,
  data_limite  DATE,
  prioridade   public.processo_prioridade NOT NULL DEFAULT 'Média',
  responsavel  TEXT,
  valor_causa  NUMERIC(14,2),
  instancia    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_processo_numero_per_user UNIQUE (user_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_processos_user     ON public.processos(user_id);
CREATE INDEX IF NOT EXISTS idx_processos_tenant   ON public.processos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_processos_cliente  ON public.processos(cliente_id);
ALTER TABLE public.processos ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_processos_updated_at ON public.processos;
CREATE TRIGGER update_processos_updated_at
  BEFORE UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_tenant_id ON public.processos;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.processos FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
DROP TRIGGER IF EXISTS audit_processos ON public.processos;
CREATE TRIGGER audit_processos
  AFTER INSERT OR UPDATE OR DELETE ON public.processos FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- audiencias
CREATE TABLE IF NOT EXISTS public.audiencias (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id        UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  processo_id      UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  processo_numero  TEXT NOT NULL,
  data             DATE NOT NULL,
  hora             TIME NOT NULL,
  local            TEXT NOT NULL,
  tipo             public.audiencia_tipo NOT NULL,
  status           public.audiencia_status NOT NULL DEFAULT 'Agendada',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audiencias_user      ON public.audiencias(user_id);
CREATE INDEX IF NOT EXISTS idx_audiencias_tenant    ON public.audiencias(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audiencias_processo  ON public.audiencias(processo_id);
ALTER TABLE public.audiencias ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_audiencias_updated_at ON public.audiencias;
CREATE TRIGGER update_audiencias_updated_at
  BEFORE UPDATE ON public.audiencias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_tenant_id ON public.audiencias;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.audiencias FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- tarefas
CREATE TABLE IF NOT EXISTS public.tarefas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id      UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  descricao      TEXT NOT NULL,
  data_conclusao DATE NOT NULL,
  prioridade     public.tarefa_prioridade NOT NULL,
  status         public.tarefa_status NOT NULL DEFAULT 'Pendente',
  responsavel    TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tarefas_user    ON public.tarefas(user_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_tenant  ON public.tarefas(tenant_id);
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_tarefas_updated_at ON public.tarefas;
CREATE TRIGGER update_tarefas_updated_at
  BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_tenant_id ON public.tarefas;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- financeiro_lancamentos
CREATE TABLE IF NOT EXISTS public.financeiro_lancamentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id      UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  descricao       TEXT NOT NULL,
  valor           NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  data_vencimento DATE NOT NULL,
  data_pagamento  DATE,
  status          public.lancamento_status NOT NULL DEFAULT 'Pendente',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lancamentos_user       ON public.financeiro_lancamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_tenant     ON public.financeiro_lancamentos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_cliente    ON public.financeiro_lancamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_status     ON public.financeiro_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_vencimento ON public.financeiro_lancamentos(data_vencimento);
ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_fin_lanc_updated_at ON public.financeiro_lancamentos;
CREATE TRIGGER update_fin_lanc_updated_at
  BEFORE UPDATE ON public.financeiro_lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_tenant_id ON public.financeiro_lancamentos;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.financeiro_lancamentos FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- documentos
CREATE TABLE IF NOT EXISTS public.documentos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id    UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id   UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  processo_id  UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  nome         TEXT NOT NULL,
  tamanho      BIGINT,
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documentos_user    ON public.documentos(user_id);
CREATE INDEX IF NOT EXISTS idx_documentos_tenant  ON public.documentos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documentos_cliente ON public.documentos(cliente_id);
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_tenant_id ON public.documentos;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- equipe (com campos enriquecidos da 013)
CREATE TABLE IF NOT EXISTS public.equipe (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id        UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome             VARCHAR(255) NOT NULL,
  email            VARCHAR(255) NOT NULL,
  telefone         VARCHAR(20),
  whatsapp         TEXT,
  cargo            VARCHAR(100) NOT NULL,
  departamento     VARCHAR(100) NOT NULL,
  nivel_acesso     TEXT DEFAULT 'READONLY'
    CHECK (nivel_acesso IN ('ADMIN','ADVOGADO','ESTAGIARIO','READONLY')),
  pode_assinar     BOOLEAN NOT NULL DEFAULT FALSE,
  cpf              TEXT,
  oab              TEXT,
  oab_uf           TEXT,
  data_nascimento  DATE,
  tipo_contrato    TEXT CHECK (tipo_contrato IN ('CLT','PJ','Estágio','Freelancer')),
  cep              TEXT,
  logradouro       TEXT,
  numero           TEXT,
  complemento      TEXT,
  bairro           TEXT,
  cidade           TEXT,
  estado           TEXT,
  data_admissao    DATE,
  salario          DECIMAL(10,2),
  status           VARCHAR(20) DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo', 'Férias')),
  endereco         TEXT,
  observacoes      TEXT,
  foto_url         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_equipe_user_id     ON public.equipe(user_id);
CREATE INDEX IF NOT EXISTS idx_equipe_tenant_id   ON public.equipe(tenant_id);
CREATE INDEX IF NOT EXISTS idx_equipe_status      ON public.equipe(status);
CREATE INDEX IF NOT EXISTS idx_equipe_departamento ON public.equipe(departamento);
CREATE INDEX IF NOT EXISTS idx_equipe_cargo       ON public.equipe(cargo);
ALTER TABLE public.equipe ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_equipe_updated_at ON public.equipe;
CREATE TRIGGER update_equipe_updated_at
  BEFORE UPDATE ON public.equipe FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_tenant_id ON public.equipe;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.equipe FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
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

-- message_templates
CREATE TABLE IF NOT EXISTS public.message_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id  UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_message_templates_updated_at ON public.message_templates;
CREATE TRIGGER set_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_tenant_id ON public.message_templates;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- user_smtp_configs
CREATE TABLE IF NOT EXISTS public.user_smtp_configs (
  user_id            UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id          UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  host               TEXT NOT NULL,
  port               INTEGER NOT NULL DEFAULT 587,
  username           TEXT NOT NULL,
  password           TEXT NOT NULL,
  password_encrypted BOOLEAN NOT NULL DEFAULT false,
  secure             BOOLEAN NOT NULL DEFAULT false,
  from_name          TEXT NOT NULL,
  from_email         TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_smtp_configs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_smtp_updated_at ON public.user_smtp_configs;
CREATE TRIGGER update_smtp_updated_at
  BEFORE UPDATE ON public.user_smtp_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_tenant_id ON public.user_smtp_configs;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.user_smtp_configs FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
DROP TRIGGER IF EXISTS audit_smtp ON public.user_smtp_configs;
CREATE TRIGGER audit_smtp
  AFTER INSERT OR UPDATE OR DELETE ON public.user_smtp_configs FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- agendamentos_buscas
CREATE TABLE IF NOT EXISTS public.agendamentos_buscas (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id              UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  tribunal               TEXT NOT NULL,
  data_ajuizamento_inicio DATE,
  data_ajuizamento_fim    DATE,
  assunto                TEXT,
  numero_processo        TEXT,
  classe_nome            TEXT,
  enviar_email           BOOLEAN NOT NULL DEFAULT false,
  frequencia_dias        INTEGER DEFAULT 1,
  ultima_execucao        TIMESTAMPTZ,
  proxima_execucao       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                 public.status_agendamento NOT NULL DEFAULT 'Ativo',
  resultados_vistos      BOOLEAN DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agendamentos_buscas ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_agendamentos_buscas_updated_at ON public.agendamentos_buscas;
CREATE TRIGGER update_agendamentos_buscas_updated_at
  BEFORE UPDATE ON public.agendamentos_buscas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_tenant_id ON public.agendamentos_buscas;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.agendamentos_buscas FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
DROP TRIGGER IF EXISTS rate_limit_agendamentos ON public.agendamentos_buscas;
CREATE TRIGGER rate_limit_agendamentos
  BEFORE INSERT ON public.agendamentos_buscas FOR EACH ROW EXECUTE FUNCTION public.check_agendamento_rate_limit();

-- ─── 7. TABELAS LEGALOPS / BPMN ───────────────────────────────

-- templates BPMN
CREATE TABLE IF NOT EXISTS public.templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES public.tenants(id),
  name       TEXT NOT NULL,
  bpmn_xml   TEXT NOT NULL,
  form_schema JSONB,
  version    INTEGER DEFAULT 1,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- process_instances
CREATE TABLE IF NOT EXISTS public.process_instances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID REFERENCES public.templates(id),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id),
  external_id  TEXT,
  status       TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'SUSPENDED', 'TERMINATED')),
  started_by   UUID REFERENCES public.profiles(id),
  started_at   TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.process_instances ENABLE ROW LEVEL SECURITY;

-- tasks (BPMN + RPA)
CREATE TABLE IF NOT EXISTS public.tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_instance_id UUID REFERENCES public.process_instances(id),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id),
  external_task_id    TEXT,
  name                TEXT NOT NULL,
  assignee_id         UUID REFERENCES public.profiles(id),
  form_schema         JSONB,
  task_type           TEXT NOT NULL DEFAULT 'HUMAN' CHECK (task_type IN ('HUMAN', 'RPA', 'API')),
  rpa_queue           TEXT,
  rpa_payload         JSONB,
  rpa_result          JSONB,
  error_message       TEXT,
  status              TEXT DEFAULT 'PENDING'
    CONSTRAINT tasks_status_check
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
  created_at          TIMESTAMPTZ DEFAULT now(),
  completed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tasks_rpa_pending ON public.tasks(tenant_id, rpa_queue, created_at)
  WHERE task_type = 'RPA' AND status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_tasks_type_status ON public.tasks(task_type, status);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_task_completion ON public.tasks;
CREATE TRIGGER trg_task_completion
  BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.handle_task_completion();

-- monitoramento_processos
CREATE TABLE IF NOT EXISTS public.monitoramento_processos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id),
  user_id         UUID NOT NULL REFERENCES public.profiles(id),
  numero          TEXT NOT NULL,
  tribunal        TEXT,
  dados_datajud   JSONB DEFAULT '{}',
  dados_rpa       JSONB DEFAULT '{}',
  assunto         TEXT,
  classe          TEXT,
  situacao        TEXT,
  valor_causa     NUMERIC(14,2),
  vara            TEXT,
  juiz            TEXT,
  partes          JSONB DEFAULT '[]',
  ultima_consulta TIMESTAMPTZ DEFAULT now(),
  convertido_em   UUID REFERENCES public.processos(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_monitoramento_tenant ON public.monitoramento_processos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_monitoramento_user   ON public.monitoramento_processos(user_id);
CREATE INDEX IF NOT EXISTS idx_monitoramento_numero ON public.monitoramento_processos(numero);
ALTER TABLE public.monitoramento_processos ENABLE ROW LEVEL SECURITY;

-- rpa_enriquecimento_cache
CREATE TABLE IF NOT EXISTS public.rpa_enriquecimento_cache (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  numero_processo  TEXT NOT NULL,
  tribunal         TEXT NOT NULL,
  resultado        JSONB NOT NULL,
  cached_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, numero_processo)
);
CREATE INDEX IF NOT EXISTS idx_rpa_cache_tenant_numero ON public.rpa_enriquecimento_cache(tenant_id, numero_processo);
CREATE INDEX IF NOT EXISTS idx_rpa_cache_cached_at     ON public.rpa_enriquecimento_cache(cached_at);
ALTER TABLE public.rpa_enriquecimento_cache ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_tenant_id ON public.rpa_enriquecimento_cache;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.rpa_enriquecimento_cache FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- ─── 8. TABELAS DE CONFIGURAÇÃO ────────────────────────────────

-- user_llm_configs
CREATE TABLE IF NOT EXISTS public.user_llm_configs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id  UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'openrouter')),
  api_key    TEXT NOT NULL,
  model      TEXT NOT NULL,
  base_url   TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
ALTER TABLE public.user_llm_configs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS user_llm_configs_updated_at ON public.user_llm_configs;
CREATE TRIGGER user_llm_configs_updated_at
  BEFORE UPDATE ON public.user_llm_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_tenant_id ON public.user_llm_configs;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.user_llm_configs FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- checklist_templates
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  area      TEXT NOT NULL,
  nome      TEXT NOT NULL,
  tarefas   JSONB NOT NULL DEFAULT '[]',
  is_global BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_tenant_id ON public.checklist_templates;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.checklist_templates FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- cliente_interacoes
CREATE TABLE IF NOT EXISTS public.cliente_interacoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id        UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL CHECK (tipo IN ('Ligação', 'Reunião', 'E-mail', 'WhatsApp', 'Outro')),
  descricao        TEXT NOT NULL,
  data_interacao   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cliente_interacoes_cliente_id
  ON public.cliente_interacoes(cliente_id, data_interacao DESC);
ALTER TABLE public.cliente_interacoes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_tenant_id ON public.cliente_interacoes;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.cliente_interacoes FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- ─── 9. TABELA DE AUDITORIA ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  operation   TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  user_id     UUID,
  tenant_id   UUID,
  record_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ─── 10. RLS POLICIES ──────────────────────────────────────────

-- tenants
DROP POLICY IF EXISTS "Users can view their own tenant"    ON public.tenants;
DROP POLICY IF EXISTS "MASTER can update their tenant"     ON public.tenants;
DROP POLICY IF EXISTS "SUPER_ADMIN can insert tenants"     ON public.tenants;
CREATE POLICY "tenants:select" ON public.tenants FOR SELECT
  USING (id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "tenants:update" ON public.tenants FOR UPDATE
  USING ((id = public.get_auth_tenant_id() AND public.get_auth_role() IN ('MASTER','ADMIN')) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "tenants:insert" ON public.tenants FOR INSERT
  WITH CHECK (public.get_auth_role() = 'SUPER_ADMIN');

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile"          ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile"        ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile"        ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their tenant"   ON public.profiles;
DROP POLICY IF EXISTS "SUPER_ADMIN and MASTER can insert profiles" ON public.profiles;
CREATE POLICY "profiles:select" ON public.profiles FOR SELECT
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "profiles:update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "profiles:insert" ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id OR
    public.get_auth_role() = 'SUPER_ADMIN' OR
    (public.role_level(public.get_auth_role()) >= 60 AND tenant_id = public.get_auth_tenant_id())
  );

-- clientes
DROP POLICY IF EXISTS "Tenant users can manage clients"    ON public.clientes;
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

-- financeiro_lancamentos
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

-- equipe
DROP POLICY IF EXISTS "Tenant users can manage equipe"    ON public.equipe;
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

-- message_templates
DROP POLICY IF EXISTS "Tenant users can manage templates"         ON public.message_templates;
DROP POLICY IF EXISTS "Users can view default or own templates"   ON public.message_templates;
DROP POLICY IF EXISTS "Users can insert their own templates"      ON public.message_templates;
DROP POLICY IF EXISTS "Users can update their own templates"      ON public.message_templates;
DROP POLICY IF EXISTS "Users can delete their own templates"      ON public.message_templates;
CREATE POLICY "message_templates:all" ON public.message_templates FOR ALL
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN' OR is_default = true);

-- user_smtp_configs
DROP POLICY IF EXISTS "Tenant users can manage smtp" ON public.user_smtp_configs;
CREATE POLICY "smtp:all" ON public.user_smtp_configs FOR ALL
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- agendamentos_buscas
DROP POLICY IF EXISTS "Tenant users can manage agendamentos" ON public.agendamentos_buscas;
CREATE POLICY "agendamentos:all" ON public.agendamentos_buscas FOR ALL
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- templates BPMN
DROP POLICY IF EXISTS "tenant_isolation_templates" ON public.templates;
CREATE POLICY "templates:all" ON public.templates FOR ALL
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN' OR tenant_id IS NULL);

-- process_instances
DROP POLICY IF EXISTS "tenant_isolation_instances" ON public.process_instances;
CREATE POLICY "process_instances:all" ON public.process_instances FOR ALL
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- tasks
DROP POLICY IF EXISTS "tenant_isolation_tasks" ON public.tasks;
CREATE POLICY "tasks:all" ON public.tasks FOR ALL
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- monitoramento_processos
DROP POLICY IF EXISTS "monitoramento_tenant_rls" ON public.monitoramento_processos;
CREATE POLICY "monitoramento:all" ON public.monitoramento_processos FOR ALL
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- rpa_enriquecimento_cache
DROP POLICY IF EXISTS "rpa_cache_tenant_rls" ON public.rpa_enriquecimento_cache;
CREATE POLICY "rpa_cache:all" ON public.rpa_enriquecimento_cache FOR ALL
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');

-- user_llm_configs
DROP POLICY IF EXISTS "user_llm_configs: leitura própria"     ON public.user_llm_configs;
DROP POLICY IF EXISTS "user_llm_configs: inserção própria"    ON public.user_llm_configs;
DROP POLICY IF EXISTS "user_llm_configs: atualização própria" ON public.user_llm_configs;
DROP POLICY IF EXISTS "user_llm_configs: exclusão própria"    ON public.user_llm_configs;
DROP POLICY IF EXISTS "llm_configs:all"                       ON public.user_llm_configs;
CREATE POLICY "llm_configs:all" ON public.user_llm_configs FOR ALL
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');

-- checklist_templates
DROP POLICY IF EXISTS "checklist_templates: leitura"         ON public.checklist_templates;
DROP POLICY IF EXISTS "checklist_templates: escrita própria"    ON public.checklist_templates;
DROP POLICY IF EXISTS "checklist_templates: atualização própria" ON public.checklist_templates;
DROP POLICY IF EXISTS "checklist_templates: exclusão própria"   ON public.checklist_templates;
CREATE POLICY "checklist:select" ON public.checklist_templates FOR SELECT
  USING (is_global = true OR tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "checklist:write" ON public.checklist_templates FOR INSERT
  WITH CHECK ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "checklist:update" ON public.checklist_templates FOR UPDATE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "checklist:delete" ON public.checklist_templates FOR DELETE
  USING ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 60) OR public.get_auth_role() = 'SUPER_ADMIN');

-- cliente_interacoes
DROP POLICY IF EXISTS "cliente_interacoes: leitura própria"  ON public.cliente_interacoes;
DROP POLICY IF EXISTS "cliente_interacoes: inserção própria" ON public.cliente_interacoes;
DROP POLICY IF EXISTS "cliente_interacoes: exclusão própria" ON public.cliente_interacoes;
DROP POLICY IF EXISTS "interacoes:select" ON public.cliente_interacoes;
DROP POLICY IF EXISTS "interacoes:insert" ON public.cliente_interacoes;
DROP POLICY IF EXISTS "interacoes:delete" ON public.cliente_interacoes;
CREATE POLICY "interacoes:select" ON public.cliente_interacoes FOR SELECT
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "interacoes:insert" ON public.cliente_interacoes FOR INSERT
  WITH CHECK ((tenant_id = public.get_auth_tenant_id() AND public.role_level(public.get_auth_role()) >= 40) OR public.get_auth_role() = 'SUPER_ADMIN');
CREATE POLICY "interacoes:delete" ON public.cliente_interacoes FOR DELETE
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

-- ─── 11. STORAGE ───────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
  VALUES ('documentos', 'documentos', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('tenant_assets', 'tenant_assets', true)
  ON CONFLICT (id) DO NOTHING;

-- Documentos storage
DROP POLICY IF EXISTS "Users can view own docs in documentos bucket"         ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to own folder in documentos bucket"  ON storage.objects;
DROP POLICY IF EXISTS "Users can update own docs in documentos bucket"       ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own docs in documentos bucket"       ON storage.objects;
CREATE POLICY "docs:select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "docs:insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "docs:update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documentos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "docs:delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documentos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Tenant assets storage (logos)
DROP POLICY IF EXISTS "Anyone can view logos"                  ON storage.objects;
DROP POLICY IF EXISTS "MASTER and SUPER_ADMIN can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "MASTER and SUPER_ADMIN can update logos" ON storage.objects;
CREATE POLICY "logos:select" ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant_assets');
CREATE POLICY "logos:insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'tenant_assets' AND
    (public.get_auth_role() IN ('MASTER', 'ADMIN', 'SUPER_ADMIN')) AND
    storage.extension(name) IN ('png', 'jpg', 'jpeg', 'svg', 'webp')
  );
CREATE POLICY "logos:update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'tenant_assets' AND
    (public.get_auth_role() IN ('MASTER', 'ADMIN', 'SUPER_ADMIN')) AND
    storage.extension(name) IN ('png', 'jpg', 'jpeg', 'svg', 'webp')
  );

-- ─── 12. SEED: TEMPLATES DE CHECKLIST ─────────────────────────

INSERT INTO public.checklist_templates (area, nome, is_global, tarefas)
SELECT * FROM (VALUES
  ('Trabalhista', 'Fluxo Padrão — Reclamação Trabalhista', true, '[
    {"titulo": "Analisar CTPS e contratos do reclamante", "prazo_dias": 2, "prioridade": "Alta"},
    {"titulo": "Verificar cálculos de verbas rescisórias", "prazo_dias": 3, "prioridade": "Alta"},
    {"titulo": "Levantar provas: holerites, ponto, e-mails", "prazo_dias": 5, "prioridade": "Alta"},
    {"titulo": "Elaborar contestação", "prazo_dias": 10, "prioridade": "Alta"},
    {"titulo": "Agendar contato com testemunhas", "prazo_dias": 7, "prioridade": "Média"},
    {"titulo": "Preparar documentos para audiência", "prazo_dias": 14, "prioridade": "Média"},
    {"titulo": "Conferir intimação de audiência", "prazo_dias": 1, "prioridade": "Alta"}
  ]'::jsonb),
  ('Cível', 'Fluxo Padrão — Ação Cível', true, '[
    {"titulo": "Analisar documentos do cliente", "prazo_dias": 2, "prioridade": "Alta"},
    {"titulo": "Consultar jurisprudência aplicável", "prazo_dias": 3, "prioridade": "Média"},
    {"titulo": "Elaborar petição inicial ou contestação", "prazo_dias": 7, "prioridade": "Alta"},
    {"titulo": "Protocolar peça e guardar comprovante", "prazo_dias": 8, "prioridade": "Alta"},
    {"titulo": "Monitorar publicações no tribunal", "prazo_dias": 5, "prioridade": "Média"},
    {"titulo": "Calcular custas e recolher guia", "prazo_dias": 3, "prioridade": "Alta"}
  ]'::jsonb),
  ('Família', 'Fluxo Padrão — Divórcio / Família', true, '[
    {"titulo": "Coletar documentos pessoais das partes e filhos", "prazo_dias": 3, "prioridade": "Alta"},
    {"titulo": "Levantar bens do casal (imóveis, veículos, contas)", "prazo_dias": 5, "prioridade": "Alta"},
    {"titulo": "Verificar regime de bens e data do casamento", "prazo_dias": 2, "prioridade": "Alta"},
    {"titulo": "Elaborar acordo ou petição inicial", "prazo_dias": 7, "prioridade": "Alta"},
    {"titulo": "Orientar cliente sobre guarda e alimentos", "prazo_dias": 3, "prioridade": "Média"},
    {"titulo": "Agendar audiência de mediação (se litigioso)", "prazo_dias": 10, "prioridade": "Média"}
  ]'::jsonb),
  ('Tributário', 'Fluxo Padrão — Ação Tributária', true, '[
    {"titulo": "Levantar débitos e certidões negativas", "prazo_dias": 3, "prioridade": "Alta"},
    {"titulo": "Analisar auto de infração ou lançamento", "prazo_dias": 3, "prioridade": "Alta"},
    {"titulo": "Verificar prazo de decadência e prescrição", "prazo_dias": 2, "prioridade": "Alta"},
    {"titulo": "Elaborar defesa administrativa ou impugnação", "prazo_dias": 7, "prioridade": "Alta"},
    {"titulo": "Avaliar adesão a parcelamento (REFIS/PERT)", "prazo_dias": 5, "prioridade": "Média"},
    {"titulo": "Monitorar publicações no DOU/DOE", "prazo_dias": 5, "prioridade": "Média"}
  ]'::jsonb),
  ('Inventário', 'Fluxo Padrão — Inventário e Sucessões', true, '[
    {"titulo": "Levantar certidão de óbito e documentos do falecido", "prazo_dias": 2, "prioridade": "Alta"},
    {"titulo": "Mapear herdeiros e meeiros", "prazo_dias": 3, "prioridade": "Alta"},
    {"titulo": "Levantar bens, dívidas e partilha pretendida", "prazo_dias": 7, "prioridade": "Alta"},
    {"titulo": "Calcular ITCMD e emitir guia de recolhimento", "prazo_dias": 10, "prioridade": "Alta"},
    {"titulo": "Elaborar escritura ou petição de inventário", "prazo_dias": 14, "prioridade": "Alta"},
    {"titulo": "Protocolar abertura do inventário (prazo: 60 dias do óbito)", "prazo_dias": 5, "prioridade": "Alta"},
    {"titulo": "Acompanhar avaliação de bens pelo perito", "prazo_dias": 20, "prioridade": "Média"}
  ]'::jsonb)
) AS v(area, nome, is_global, tarefas)
WHERE NOT EXISTS (SELECT 1 FROM public.checklist_templates WHERE is_global = true);

-- ─── 13. SEED: MESSAGE TEMPLATES ──────────────────────────────

INSERT INTO public.message_templates (user_id, title, content, is_default)
SELECT * FROM (VALUES
  (null::uuid, 'Atualização de Processo',
   'Olá [nome_cliente], o status do seu processo nº [numero_processo] foi atualizado para: [status_processo].', true),
  (null::uuid, 'Lembrete de Audiência',
   'Prezado(a) [nome_cliente], lembramos da sua audiência agendada para o dia [data_audiencia] às [hora_audiencia] referente ao processo nº [numero_processo].', true),
  (null::uuid, 'Cobrança de Honorários',
   'Olá [nome_cliente], este é um lembrete sobre o pagamento dos honorários no valor de R$ [valor_honorarios], com vencimento em [data_vencimento].', true)
) AS v(user_id, title, content, is_default)
WHERE NOT EXISTS (SELECT 1 FROM public.message_templates WHERE is_default = true);
