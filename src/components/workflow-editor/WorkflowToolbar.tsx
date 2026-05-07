import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Play, Square, Download, Upload, RotateCcw, Workflow,
  Loader2, Check, AlertCircle
} from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflowStore'
import { cn } from '@/lib/utils'

const STATUS_SUMMARY = {
  idle:     { icon: null, label: '' },
  running:  { icon: Loader2, label: 'Executando...', class: 'text-blue-500 animate-spin' },
  done_ok:  { icon: Check, label: 'Concluído', class: 'text-green-500' },
  done_err: { icon: AlertCircle, label: 'Erros encontrados', class: 'text-red-500' },
}

export default function WorkflowToolbar({ onImportClick }: { onImportClick: () => void }) {
  const { workflowName, setWorkflowName, executeWorkflow, exportJSON, resetWorkflow, nodes, isExecuting, isDirty } = useWorkflowStore()
  const [execState, setExecState] = useState<'idle' | 'running' | 'done_ok' | 'done_err'>('idle')

  const hasTrigger = nodes.some((n) => n.data.nodeType === 'trigger')

  const handleExecute = async () => {
    if (isExecuting) return
    setExecState('running')
    await executeWorkflow()
    const hasErrors = useWorkflowStore.getState().nodes.some((n) => n.data.status === 'error')
    setExecState(hasErrors ? 'done_err' : 'done_ok')
    setTimeout(() => setExecState('idle'), 4000)
  }

  const summary = STATUS_SUMMARY[execState]

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-2">
        <Workflow className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Flow</span>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Workflow name */}
      <Input
        value={workflowName}
        onChange={(e) => setWorkflowName(e.target.value)}
        className="h-7 w-48 text-sm border-0 shadow-none focus-visible:ring-1 font-medium"
      />

      {isDirty && (
        <span className="text-[10px] text-zinc-400 italic">não salvo</span>
      )}

      <div className="flex-1" />

      {/* Execution status */}
      {execState !== 'idle' && summary.icon && (
        <div className="flex items-center gap-1.5 text-xs">
          <summary.icon className={cn('w-3.5 h-3.5', summary.class)} />
          <span className={cn('font-medium', summary.class?.replace('animate-spin',''))}>{summary.label}</span>
        </div>
      )}

      <Separator orientation="vertical" className="h-5" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onImportClick}>
              <Upload className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Importar JSON</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={exportJSON}>
              <Download className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Exportar JSON (⌘S)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-zinc-500" onClick={resetWorkflow}>
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Resetar canvas</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <Button
          size="sm"
          className={cn('h-7 gap-1.5', !hasTrigger && 'opacity-50')}
          disabled={isExecuting || !hasTrigger}
          onClick={handleExecute}
        >
          {isExecuting
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Executando</>
            : <><Play className="w-3.5 h-3.5" /> Executar</>
          }
        </Button>
      </div>
    </div>
  )
}
