-- ============================================================
-- ADVOGA PRO - Migração 1: Agendamentos e SMTP
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- Tabela de Configurações SMTP
CREATE TABLE IF NOT EXISTS public.user_smtp_configs (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  secure BOOLEAN NOT NULL DEFAULT false, -- true para port 465, false para outras (StartTLS)
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.user_smtp_configs ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso para a tabela SMTP
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_smtp_configs' AND policyname='Users can view their own SMTP config') THEN
    CREATE POLICY "Users can view their own SMTP config" ON public.user_smtp_configs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_smtp_configs' AND policyname='Users can insert their own SMTP config') THEN
    CREATE POLICY "Users can insert their own SMTP config" ON public.user_smtp_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_smtp_configs' AND policyname='Users can update their own SMTP config') THEN
    CREATE POLICY "Users can update their own SMTP config" ON public.user_smtp_configs FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_smtp_configs' AND policyname='Users can delete their own SMTP config') THEN
    CREATE POLICY "Users can delete their own SMTP config" ON public.user_smtp_configs FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Tabela de Agendamentos de Buscas
CREATE TYPE public.status_agendamento AS ENUM ('Ativo', 'Inativo', 'Concluído', 'Falha');

CREATE TABLE IF NOT EXISTS public.agendamentos_buscas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tribunal TEXT NOT NULL,
  data_ajuizamento_inicio DATE,
  data_ajuizamento_fim DATE,
  assunto TEXT,
  numero_processo TEXT,
  classe_nome TEXT,
  enviar_email BOOLEAN NOT NULL DEFAULT false,
  frequencia_dias INTEGER DEFAULT 1, -- ex: a cada 1 dia
  ultima_execucao TIMESTAMPTZ,
  proxima_execucao TIMESTAMPTZ NOT NULL DEFAULT now(),
  status public.status_agendamento NOT NULL DEFAULT 'Ativo',
  resultados_vistos BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agendamentos_buscas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agendamentos_buscas' AND policyname='Users can view their own agendamentos') THEN
    CREATE POLICY "Users can view their own agendamentos" ON public.agendamentos_buscas FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agendamentos_buscas' AND policyname='Users can insert their own agendamentos') THEN
    CREATE POLICY "Users can insert their own agendamentos" ON public.agendamentos_buscas FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agendamentos_buscas' AND policyname='Users can update their own agendamentos') THEN
    CREATE POLICY "Users can update their own agendamentos" ON public.agendamentos_buscas FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agendamentos_buscas' AND policyname='Users can delete their own agendamentos') THEN
    CREATE POLICY "Users can delete their own agendamentos" ON public.agendamentos_buscas FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Triggers de timestamp
DROP TRIGGER IF EXISTS update_smtp_updated_at ON public.user_smtp_configs;
CREATE TRIGGER update_smtp_updated_at BEFORE UPDATE ON public.user_smtp_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_agendamentos_buscas_updated_at ON public.agendamentos_buscas;
CREATE TRIGGER update_agendamentos_buscas_updated_at BEFORE UPDATE ON public.agendamentos_buscas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Configuração do Supabase Cron (pg_cron)
-- Requer extensões `pg_cron` e `pg_net` ativas no database
-- ============================================================

-- Ativação das extensões (apenas superusuário / postgress pode rodar)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- O agendamento da chamada HTTP para a Edge Function será feito após o deploy da function,
-- pois dependerá da URL de produção da Edge Function.
