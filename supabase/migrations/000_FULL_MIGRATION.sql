-- ============================================================
-- ADVOGA PRO - Script Completo de Migração
-- Execute este script no SQL Editor do Supabase
-- Ordem correta: profiles → clientes → utilitários → templates → fixes → equipe
-- ============================================================

-- ============================================================
-- MIGRAÇÃO 1: PROFILES
-- ============================================================

-- Create profiles table for user data
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can view their own profile') THEN
    CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can update their own profile') THEN
    CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can insert their own profile') THEN
    CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;

-- Create trigger for automatic profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create trigger for automatic timestamp updates on profiles
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- MIGRAÇÃO 2: CLIENTES
-- ============================================================

-- Enum para status do cliente
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cliente_status') THEN
    CREATE TYPE public.cliente_status AS ENUM ('Ativo', 'Inativo');
  END IF;
END $$;

-- Tabela de clientes
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  endereco TEXT,
  data_registro DATE NOT NULL DEFAULT (now()::date),
  processos_ativos INTEGER NOT NULL DEFAULT 0 CHECK (processos_ativos >= 0),
  status public.cliente_status NOT NULL DEFAULT 'Ativo',
  ultimo_contato DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_client_email_per_user UNIQUE (user_id, email)
);

COMMENT ON TABLE public.clientes IS 'Registros de clientes, escopados por usuário (profiles.id).';

CREATE INDEX IF NOT EXISTS idx_clientes_user_id ON public.clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_clientes_user_nome ON public.clientes(user_id, nome);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clientes' AND policyname = 'Users can view their own clientes') THEN
    CREATE POLICY "Users can view their own clientes" ON public.clientes FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clientes' AND policyname = 'Users can insert their own clientes') THEN
    CREATE POLICY "Users can insert their own clientes" ON public.clientes FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clientes' AND policyname = 'Users can update their own clientes') THEN
    CREATE POLICY "Users can update their own clientes" ON public.clientes FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clientes' AND policyname = 'Users can delete their own clientes') THEN
    CREATE POLICY "Users can delete their own clientes" ON public.clientes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_clientes_updated_at ON public.clientes;
CREATE TRIGGER update_clientes_updated_at
BEFORE UPDATE ON public.clientes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- MIGRAÇÃO 3: UTILITÁRIOS (processos, audiências, tarefas, financeiro, documentos)
-- ============================================================

-- ENUMs
DO $$ BEGIN
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
END $$;

-- Processos
CREATE TABLE IF NOT EXISTS public.processos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  assunto TEXT NOT NULL,
  status public.processo_status NOT NULL DEFAULT 'Em Andamento',
  data_inicio DATE NOT NULL,
  data_limite DATE,
  prioridade public.processo_prioridade NOT NULL DEFAULT 'Média',
  responsavel TEXT,
  valor_causa NUMERIC(14,2),
  instancia TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_processo_numero_per_user UNIQUE (user_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_processos_user ON public.processos(user_id);
CREATE INDEX IF NOT EXISTS idx_processos_cliente ON public.processos(cliente_id);
ALTER TABLE public.processos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='processos' AND policyname='Users can view their own processos') THEN
    CREATE POLICY "Users can view their own processos" ON public.processos FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='processos' AND policyname='Users can insert their own processos') THEN
    CREATE POLICY "Users can insert their own processos" ON public.processos FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='processos' AND policyname='Users can update their own processos') THEN
    CREATE POLICY "Users can update their own processos" ON public.processos FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='processos' AND policyname='Users can delete their own processos') THEN
    CREATE POLICY "Users can delete their own processos" ON public.processos FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
DROP TRIGGER IF EXISTS update_processos_updated_at ON public.processos;
CREATE TRIGGER update_processos_updated_at BEFORE UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audiências
CREATE TABLE IF NOT EXISTS public.audiencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  processo_numero TEXT NOT NULL,
  data DATE NOT NULL,
  hora TIME NOT NULL,
  local TEXT NOT NULL,
  tipo public.audiencia_tipo NOT NULL,
  status public.audiencia_status NOT NULL DEFAULT 'Agendada',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audiencias_user ON public.audiencias(user_id);
CREATE INDEX IF NOT EXISTS idx_audiencias_processo ON public.audiencias(processo_id);
ALTER TABLE public.audiencias ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audiencias' AND policyname='Users can view their own audiencias') THEN
    CREATE POLICY "Users can view their own audiencias" ON public.audiencias FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audiencias' AND policyname='Users can insert their own audiencias') THEN
    CREATE POLICY "Users can insert their own audiencias" ON public.audiencias FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audiencias' AND policyname='Users can update their own audiencias') THEN
    CREATE POLICY "Users can update their own audiencias" ON public.audiencias FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audiencias' AND policyname='Users can delete their own audiencias') THEN
    CREATE POLICY "Users can delete their own audiencias" ON public.audiencias FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
DROP TRIGGER IF EXISTS update_audiencias_updated_at ON public.audiencias;
CREATE TRIGGER update_audiencias_updated_at BEFORE UPDATE ON public.audiencias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tarefas
CREATE TABLE IF NOT EXISTS public.tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  data_conclusao DATE NOT NULL,
  prioridade public.tarefa_prioridade NOT NULL,
  status public.tarefa_status NOT NULL DEFAULT 'Pendente',
  responsavel TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tarefas_user ON public.tarefas(user_id);
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tarefas' AND policyname='Users can view their own tarefas') THEN
    CREATE POLICY "Users can view their own tarefas" ON public.tarefas FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tarefas' AND policyname='Users can insert their own tarefas') THEN
    CREATE POLICY "Users can insert their own tarefas" ON public.tarefas FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tarefas' AND policyname='Users can update their own tarefas') THEN
    CREATE POLICY "Users can update their own tarefas" ON public.tarefas FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tarefas' AND policyname='Users can delete their own tarefas') THEN
    CREATE POLICY "Users can delete their own tarefas" ON public.tarefas FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
DROP TRIGGER IF EXISTS update_tarefas_updated_at ON public.tarefas;
CREATE TRIGGER update_tarefas_updated_at BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lançamentos Financeiros
CREATE TABLE IF NOT EXISTS public.financeiro_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status public.lancamento_status NOT NULL DEFAULT 'Pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lancamentos_user ON public.financeiro_lancamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_cliente ON public.financeiro_lancamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_status ON public.financeiro_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_vencimento ON public.financeiro_lancamentos(data_vencimento);
ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='financeiro_lancamentos' AND policyname='Users can view their own lancamentos') THEN
    CREATE POLICY "Users can view their own lancamentos" ON public.financeiro_lancamentos FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='financeiro_lancamentos' AND policyname='Users can insert their own lancamentos') THEN
    CREATE POLICY "Users can insert their own lancamentos" ON public.financeiro_lancamentos FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='financeiro_lancamentos' AND policyname='Users can update their own lancamentos') THEN
    CREATE POLICY "Users can update their own lancamentos" ON public.financeiro_lancamentos FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='financeiro_lancamentos' AND policyname='Users can delete their own lancamentos') THEN
    CREATE POLICY "Users can delete their own lancamentos" ON public.financeiro_lancamentos FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
DROP TRIGGER IF EXISTS update_fin_lanc_updated_at ON public.financeiro_lancamentos;
CREATE TRIGGER update_fin_lanc_updated_at BEFORE UPDATE ON public.financeiro_lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Documentos
CREATE TABLE IF NOT EXISTS public.documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  tamanho BIGINT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documentos_user ON public.documentos(user_id);
CREATE INDEX IF NOT EXISTS idx_documentos_cliente ON public.documentos(cliente_id);
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='documentos' AND policyname='Users can view their own documentos') THEN
    CREATE POLICY "Users can view their own documentos" ON public.documentos FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='documentos' AND policyname='Users can insert their own documentos') THEN
    CREATE POLICY "Users can insert their own documentos" ON public.documentos FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='documentos' AND policyname='Users can delete their own documentos') THEN
    CREATE POLICY "Users can delete their own documentos" ON public.documentos FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Bucket de Storage para documentos (privado)
INSERT INTO storage.buckets (id, name, public)
SELECT 'documentos', 'documentos', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documentos');

-- Políticas do Storage
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can view own docs in documentos bucket') THEN
    CREATE POLICY "Users can view own docs in documentos bucket"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'documentos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can upload to own folder in documentos bucket') THEN
    CREATE POLICY "Users can upload to own folder in documentos bucket"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'documentos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update own docs in documentos bucket') THEN
    CREATE POLICY "Users can update own docs in documentos bucket"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'documentos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete own docs in documentos bucket') THEN
    CREATE POLICY "Users can delete own docs in documentos bucket"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'documentos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

-- ============================================================
-- MIGRAÇÃO 4: MESSAGE TEMPLATES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view default or own templates" ON public.message_templates;
CREATE POLICY "Users can view default or own templates"
  ON public.message_templates FOR SELECT TO authenticated
  USING (is_default = true OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own templates" ON public.message_templates;
CREATE POLICY "Users can insert their own templates"
  ON public.message_templates FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_default = false);

DROP POLICY IF EXISTS "Users can update their own templates" ON public.message_templates;
CREATE POLICY "Users can update their own templates"
  ON public.message_templates FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND is_default = false);

DROP POLICY IF EXISTS "Users can delete their own templates" ON public.message_templates;
CREATE POLICY "Users can delete their own templates"
  ON public.message_templates FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND is_default = false);

DROP TRIGGER IF EXISTS set_message_templates_updated_at ON public.message_templates;
CREATE TRIGGER set_message_templates_updated_at
BEFORE UPDATE ON public.message_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default templates apenas se a tabela estiver vazia
INSERT INTO public.message_templates (user_id, title, content, is_default)
SELECT * FROM (
  VALUES
    (null::uuid, 'Atualização de Processo', 'Olá [nome_cliente], o status do seu processo nº [numero_processo] foi atualizado para: [status_processo].', true),
    (null::uuid, 'Lembrete de Audiência', 'Prezado(a) [nome_cliente], lembramos da sua audiência agendada para o dia [data_audiencia] às [hora_audiencia] referente ao processo nº [numero_processo].', true),
    (null::uuid, 'Cobrança de Honorários', 'Olá [nome_cliente], este é um lembrete sobre o pagamento dos honorários no valor de R$ [valor_honorarios], com vencimento em [data_vencimento].', true)
) AS v(user_id, title, content, is_default)
WHERE NOT EXISTS (SELECT 1 FROM public.message_templates);

-- ============================================================
-- MIGRAÇÃO 5: FIX CLIENT DELETION (CASCADE)
-- ============================================================

ALTER TABLE public.processos
DROP CONSTRAINT IF EXISTS processos_cliente_id_fkey;

ALTER TABLE public.processos
ADD CONSTRAINT processos_cliente_id_fkey
FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;

ALTER TABLE public.financeiro_lancamentos
DROP CONSTRAINT IF EXISTS financeiro_lancamentos_cliente_id_fkey;

ALTER TABLE public.financeiro_lancamentos
ADD CONSTRAINT financeiro_lancamentos_cliente_id_fkey
FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;

-- ============================================================
-- MIGRAÇÃO 6: EQUIPE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.equipe (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    cargo VARCHAR(100) NOT NULL,
    departamento VARCHAR(100) NOT NULL,
    data_admissao DATE,
    salario DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo', 'Férias')),
    endereco TEXT,
    observacoes TEXT,
    foto_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipe_user_id ON public.equipe(user_id);
CREATE INDEX IF NOT EXISTS idx_equipe_status ON public.equipe(status);
CREATE INDEX IF NOT EXISTS idx_equipe_departamento ON public.equipe(departamento);
CREATE INDEX IF NOT EXISTS idx_equipe_cargo ON public.equipe(cargo);

ALTER TABLE public.equipe ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='equipe' AND policyname='Users can view own team members') THEN
    CREATE POLICY "Users can view own team members" ON public.equipe FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='equipe' AND policyname='Users can insert own team members') THEN
    CREATE POLICY "Users can insert own team members" ON public.equipe FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='equipe' AND policyname='Users can update own team members') THEN
    CREATE POLICY "Users can update own team members" ON public.equipe FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='equipe' AND policyname='Users can delete own team members') THEN
    CREATE POLICY "Users can delete own team members" ON public.equipe FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_equipe_updated_at ON public.equipe;
CREATE TRIGGER update_equipe_updated_at
    BEFORE UPDATE ON public.equipe
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- FIM DA MIGRAÇÃO - Verificar resultado:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
-- ============================================================
