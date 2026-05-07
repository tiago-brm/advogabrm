import React, { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { getNodeDef } from '@/lib/workflow/nodeDefinitions'
import type { WorkflowNodeData } from '@/types/workflow'
import { AlertCircle, CheckCircle2, Loader2, Power } from 'lucide-react'

const STATUS_DOT: Record<string, React.ReactNode> = {
  idle:     <span className="w-2 h-2 rounded-full bg-zinc-400" />,
  running:  <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />,
  success:  <CheckCircle2 className="w-3 h-3 text-green-400" />,
  error:    <AlertCircle className="w-3 h-3 text-red-400" />,
  disabled: <Power className="w-3 h-3 text-zinc-500" />,
}

function configSummary(data: WorkflowNodeData): string {
  const c = data.config as Record<string, unknown>
  if (data.nodeType === 'http-request')   return `${c.method} ${c.url || '(sem URL)'}`.slice(0, 40)
  if (data.nodeType === 'trigger')        return `Tipo: ${c.triggerType}`
  if (data.nodeType === 'condition')      return `${c.expression || 'expr'} ${c.operator} ${c.value}`
  if (data.nodeType === 'delay')          return `${c.amount} ${c.unit}`
  if (data.nodeType === 'ai-agent')       return (c.model as string) || 'Modelo não definido'
  if (data.nodeType === 'send-email')     return `Para: ${c.to || '(sem destinatário)'}`
  if (data.nodeType === 'database-query') return (c.query as string)?.slice(0, 40) || 'Query vazia'
  if (data.nodeType === 'transform')      return `Modo: ${c.mode}`
  return ''
}

const BaseNode = memo(({ data, selected }: NodeProps<WorkflowNodeData>) => {
  const def = getNodeDef(data.nodeType)
  const Icon = def.icon
  const isTrigger = data.nodeType === 'trigger'

  return (
    <div
      className={cn(
        'group relative min-w-[200px] max-w-[260px] rounded-lg border bg-white dark:bg-zinc-900',
        'shadow-md transition-all duration-150',
        selected
          ? `border-2 ${def.borderColor} shadow-lg`
          : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600',
        data.disabled && 'opacity-50',
      )}
    >
      {/* Input handles */}
      {def.inputs.map((h, i) => (
        <Handle
          key={h.id}
          type="target"
          position={Position.Left}
          id={h.id}
          style={{ top: def.inputs.length === 1 ? '50%' : `${25 + i * 30}%` }}
          className="!w-3 !h-3 !border-2 !border-zinc-400 !bg-white dark:!bg-zinc-900 hover:!border-primary transition-colors"
        />
      ))}

      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-t-lg',
          def.color,
          isTrigger ? 'rounded-lg' : 'rounded-t-lg',
        )}
      >
        <div className="w-6 h-6 rounded bg-white/20 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-white text-xs font-semibold tracking-wide flex-1 truncate">
          {data.label}
        </span>
        <div className="shrink-0">{STATUS_DOT[data.status] ?? STATUS_DOT.idle}</div>
      </div>

      {/* Body */}
      {!isTrigger && (
        <div className="px-3 py-2 space-y-1">
          {data.hasError && (
            <div className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
              <AlertCircle className="w-3 h-3" />
              {data.errorMessage || 'Erro de configuração'}
            </div>
          )}
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight font-mono truncate">
            {configSummary(data) || (
              <span className="italic">Sem configuração</span>
            )}
          </p>
        </div>
      )}

      {/* Output handles */}
      {def.outputs.map((h, i) => (
        <Handle
          key={h.id}
          type="source"
          position={Position.Right}
          id={h.id}
          style={{ top: def.outputs.length === 1 ? '50%' : `${25 + i * 30}%` }}
          className="!w-3 !h-3 !border-2 !border-zinc-400 !bg-white dark:!bg-zinc-900 hover:!border-primary transition-colors"
        />
      ))}

      {/* Output labels for multi-output nodes */}
      {def.outputs.length > 1 && (
        <div className="absolute right-4 top-0 h-full flex flex-col justify-around pointer-events-none pr-1">
          {def.outputs.map((h) => (
            <span key={h.id} className="text-[9px] text-zinc-400 dark:text-zinc-500 text-right">
              {h.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})

BaseNode.displayName = 'BaseNode'
export default BaseNode
