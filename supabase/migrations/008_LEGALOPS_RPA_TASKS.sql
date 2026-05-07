-- ============================================================
-- AdvogaBRM / LegalOps Tech Solutions
-- Patch 008: Hiperautomação — Suporte a Service Tasks (RPA)
-- Expande a tabela `tasks` para suportar execução por robôs.
-- Execute este script no SQL Editor do Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Novas colunas na tabela tasks
-- ------------------------------------------------------------

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_type     TEXT    NOT NULL DEFAULT 'HUMAN'
                                         CHECK (task_type IN ('HUMAN', 'RPA', 'API')),
  ADD COLUMN IF NOT EXISTS rpa_queue     TEXT,
  ADD COLUMN IF NOT EXISTS rpa_payload   JSONB,
  ADD COLUMN IF NOT EXISTS rpa_result    JSONB,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- ------------------------------------------------------------
-- 2. Ampliar o CHECK de status para incluir IN_PROGRESS e FAILED
--    (idempotente: dropa a constraint antiga e recria)
-- ------------------------------------------------------------

DO $$ BEGIN
  -- Remove a constraint antiga de status (criada na migration 006)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass
      AND contype = 'c'
      AND conname = 'tasks_status_check'
  ) THEN
    ALTER TABLE public.tasks DROP CONSTRAINT tasks_status_check;
  END IF;
END $$;

-- Recria com todos os valores válidos
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'));

-- ------------------------------------------------------------
-- 3. Índices para polling eficiente pelo Worker
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_tasks_rpa_pending
  ON public.tasks (tenant_id, rpa_queue, created_at)
  WHERE task_type = 'RPA' AND status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_tasks_type_status
  ON public.tasks (task_type, status);

-- ------------------------------------------------------------
-- 4. Função/Trigger: handle_task_completion
--    Ao marcar uma task como COMPLETED, notifica via pg_notify
--    para que o motor BPMN possa avançar a process_instance.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_task_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Só age em transições para COMPLETED
  IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN

    -- Emite notificação assíncrona no canal 'bpmn_task_completed'
    -- O payload JSON permite ao motor identificar exatamente qual
    -- process_instance avançar, sem nova query.
    PERFORM pg_notify(
      'bpmn_task_completed',
      json_build_object(
        'task_id',             NEW.id,
        'process_instance_id', NEW.process_instance_id,
        'tenant_id',           NEW.tenant_id,
        'task_type',           NEW.task_type,
        'rpa_queue',           NEW.rpa_queue,
        'rpa_result',          NEW.rpa_result,
        'completed_at',        now()
      )::text
    );

    -- Garante que completed_at é preenchido mesmo via updates do Worker
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Cria o trigger apenas se ainda não existir
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_task_completion'
      AND tgrelid = 'public.tasks'::regclass
  ) THEN
    CREATE TRIGGER trg_task_completion
      BEFORE UPDATE ON public.tasks
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_task_completion();
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5. Policy RLS adicional: Workers externos usam service_role,
--    portanto já bypassam RLS.
--    Para Workers que usam anon/authenticated, adiciona policy
--    de UPDATE restrita ao próprio tenant via rpa_queue.
--    (Apenas se a policy de tenant isolation geral não cobrir.)
-- ------------------------------------------------------------

-- A policy existente "tenant_isolation_tasks" (migration 006)
-- cobre SELECT/INSERT/UPDATE/DELETE por tenant, então nenhuma
-- policy nova é necessária para Workers autenticados como tenant.
-- Workers externos DEVEM usar a service_role key do Supabase,
-- que bypassa RLS por design.

-- ------------------------------------------------------------
-- Comentários descritivos nas novas colunas
-- ------------------------------------------------------------

COMMENT ON COLUMN public.tasks.task_type IS
  'Executor da tarefa: HUMAN (usuário), RPA (robô), API (serviço externo)';

COMMENT ON COLUMN public.tasks.rpa_queue IS
  'Identificador do robô/fila (ex: emissor_guia_tjms). Preenchido quando task_type = RPA ou API.';

COMMENT ON COLUMN public.tasks.rpa_payload IS
  'Parâmetros injetados pelo motor BPMN para o robô executar (ex: {cpf, valor, processo_id}).';

COMMENT ON COLUMN public.tasks.rpa_result IS
  'Resultado retornado pelo robô em caso de sucesso (ex: {url_boleto, pdf_path}).';

COMMENT ON COLUMN public.tasks.error_message IS
  'Mensagem de erro registrada pelo robô em caso de falha. Útil para diagnóstico e retentativas.';
