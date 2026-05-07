# RPA Worker Flow — AdvogaBRM Hiperautomação

Este documento descreve como um Worker externo (Node.js ou Python) deve interagir com o Supabase para consumir, executar e devolver tarefas do tipo `RPA`.

---

## Pré-requisitos

- **Supabase `service_role` key**: Workers externos devem usar a `service_role` key, pois operam fora do contexto de um usuário autenticado. Essa key bypassa o RLS — guarde-a como secret no seu servidor/container, nunca no frontend.
- Variáveis de ambiente necessárias:
  ```
  SUPABASE_URL=https://<project>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<sua-service-role-key>
  RPA_QUEUE_NAME=emissor_guia_tjms   # ou outro identificador
  ```

---

## Ciclo de Vida de uma Task RPA

```
BPMN Engine cria task       Worker busca task            Robô executa
status: PENDING       →     status: IN_PROGRESS    →     status: COMPLETED | FAILED
task_type: RPA              (lock otimista)               rpa_result | error_message
```

O trigger `trg_task_completion` emite automaticamente um `pg_notify` no canal `bpmn_task_completed` quando o status muda para `COMPLETED`, sinalizando ao motor BPMN para avançar a process_instance.

---

## Implementação em Node.js

```typescript
// worker.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // service_role bypassa RLS
);

const QUEUE = process.env.RPA_QUEUE_NAME!;
const POLL_INTERVAL_MS = 5_000;

async function claimNextTask() {
  // Busca e bloqueia atomicamente usando UPDATE com RETURNING.
  // Isso evita race condition entre múltiplas instâncias do Worker.
  const { data, error } = await supabase.rpc('claim_rpa_task', {
    p_queue: QUEUE,
  });

  if (error) throw error;
  return data as { id: string; rpa_payload: Record<string, unknown> } | null;
}

async function markInProgress(taskId: string) {
  await supabase
    .from('tasks')
    .update({ status: 'IN_PROGRESS' })
    .eq('id', taskId);
}

async function markCompleted(taskId: string, result: Record<string, unknown>) {
  await supabase
    .from('tasks')
    .update({
      status: 'COMPLETED',
      rpa_result: result,
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId);
  // O trigger handle_task_completion dispara pg_notify aqui.
}

async function markFailed(taskId: string, errorMsg: string) {
  await supabase
    .from('tasks')
    .update({
      status: 'FAILED',
      error_message: errorMsg,
    })
    .eq('id', taskId);
}

async function runRobot(payload: Record<string, unknown>) {
  // Implemente aqui a lógica do seu robô (Playwright, Selenium, chamada de API, etc.)
  // Deve retornar o resultado ou lançar um Error em caso de falha.
  throw new Error('Implemente runRobot()');
}

async function poll() {
  const task = await claimNextTask();
  if (!task) return; // nenhuma task disponível

  console.log(`[Worker] Processando task ${task.id}`);
  await markInProgress(task.id);

  try {
    const result = await runRobot(task.rpa_payload);
    await markCompleted(task.id, result);
    console.log(`[Worker] Task ${task.id} concluída.`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(task.id, msg);
    console.error(`[Worker] Task ${task.id} falhou: ${msg}`);
  }
}

// Loop de polling
setInterval(poll, POLL_INTERVAL_MS);
poll(); // dispara imediatamente na inicialização
```

---

## Função SQL para Claim Atômico (sem race condition)

Adicione esta função ao Supabase para o `claimNextTask()` acima funcionar corretamente. Sem ela, dois Workers simultâneos podem pegar a mesma task.

```sql
-- Adicione via SQL Editor do Supabase
CREATE OR REPLACE FUNCTION public.claim_rpa_task(p_queue TEXT)
RETURNS TABLE (
  id           UUID,
  rpa_payload  JSONB
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.tasks
  SET    status = 'IN_PROGRESS'
  WHERE  id = (
    SELECT id FROM public.tasks
    WHERE  task_type = 'RPA'
      AND  rpa_queue = p_queue
      AND  status    = 'PENDING'
    ORDER BY created_at
    LIMIT  1
    FOR UPDATE SKIP LOCKED  -- evita bloqueio entre Workers paralelos
  )
  RETURNING id, rpa_payload;
$$;
```

---

## Implementação em Python

```python
# worker.py
import os, time
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]  # service_role
QUEUE        = os.environ["RPA_QUEUE_NAME"]
POLL_INTERVAL = 5  # segundos

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def claim_next_task() -> dict | None:
    result = supabase.rpc("claim_rpa_task", {"p_queue": QUEUE}).execute()
    rows = result.data
    return rows[0] if rows else None


def mark_completed(task_id: str, rpa_result: dict):
    supabase.table("tasks").update({
        "status":     "COMPLETED",
        "rpa_result": rpa_result,
    }).eq("id", task_id).execute()
    # O trigger handle_task_completion dispara pg_notify aqui.


def mark_failed(task_id: str, error_msg: str):
    supabase.table("tasks").update({
        "status":        "FAILED",
        "error_message": error_msg,
    }).eq("id", task_id).execute()


def run_robot(payload: dict) -> dict:
    # Implemente aqui a lógica do robô (Playwright, requests, etc.)
    raise NotImplementedError("Implemente run_robot()")


def poll():
    task = claim_next_task()
    if not task:
        return

    task_id = task["id"]
    print(f"[Worker] Processando task {task_id}")

    try:
        result = run_robot(task["rpa_payload"])
        mark_completed(task_id, result)
        print(f"[Worker] Task {task_id} concluída.")
    except Exception as e:
        mark_failed(task_id, str(e))
        print(f"[Worker] Task {task_id} falhou: {e}")


if __name__ == "__main__":
    while True:
        poll()
        time.sleep(POLL_INTERVAL)
```

---

## Alternativa: Supabase Realtime (push em vez de polling)

Para latência menor (útil em robôs de emissão de guias em tempo real), use o canal Realtime no lugar do polling:

```typescript
supabase
  .channel('rpa-tasks')
  .on(
    'postgres_changes',
    {
      event:  'INSERT',
      schema: 'public',
      table:  'tasks',
      filter: `task_type=eq.RPA&rpa_queue=eq.${QUEUE}&status=eq.PENDING`,
    },
    async (payload) => {
      const task = payload.new as { id: string; rpa_payload: Record<string, unknown> };
      // Faz claim atômico antes de processar para evitar duplicação
      const claimed = await claimNextTask();
      if (claimed?.id === task.id) {
        await processTask(claimed);
      }
    },
  )
  .subscribe();
```

> **Aviso**: O Realtime não substitui o claim atômico. Dois Workers podem receber o mesmo evento; o `claim_rpa_task` garante que apenas um processe a tarefa.

---

## Segurança

| Aspecto | Recomendação |
|---|---|
| Chave do Worker | Sempre `service_role` em variável de ambiente; nunca hardcoded |
| Rede | Worker deve estar na mesma VPN/VPC que o Supabase quando possível |
| Retry | Implemente backoff exponencial antes de `markFailed` para erros transitórios |
| Timeout | Defina um TTL: tasks `IN_PROGRESS` há mais de N minutos devem ser resetadas para `PENDING` por um job de limpeza |

---

## Job de Limpeza (Timeout de Tasks Travadas)

Tasks que ficaram `IN_PROGRESS` por muito tempo (Worker crashou) devem ser resetadas. Execute via `pg_cron` no Supabase:

```sql
-- Requer a extensão pg_cron habilitada no Supabase
SELECT cron.schedule(
  'reset-stuck-rpa-tasks',
  '*/10 * * * *',  -- a cada 10 minutos
  $$
    UPDATE public.tasks
    SET    status        = 'PENDING',
           error_message = 'Resetada por timeout (Worker não respondeu)'
    WHERE  task_type = 'RPA'
      AND  status    = 'IN_PROGRESS'
      AND  updated_at < now() - INTERVAL '15 minutes';
  $$
);
```

> Para que esse job funcione, adicione `updated_at TIMESTAMPTZ DEFAULT now()` à tabela `tasks` e um trigger de atualização automática, ou filtre por `created_at` como aproximação.
