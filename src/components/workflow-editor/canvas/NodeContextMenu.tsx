import React, { useEffect, useRef } from 'react'
import { Copy, Trash2, Power } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflowStore'

interface Props {
  nodeId: string
  x: number
  y: number
  onClose: () => void
}

export default function NodeContextMenu({ nodeId, x, y, onClose }: Props) {
  const { removeNode, duplicateNode, toggleNodeDisabled } = useWorkflowStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const item = (icon: React.ReactNode, label: string, action: () => void, danger = false) => (
    <button
      onClick={() => { action(); onClose() }}
      className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md transition-colors
        ${danger
          ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30'
          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: x, top: y, zIndex: 50 }}
      className="min-w-[160px] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-1"
    >
      {item(<Copy className="w-3.5 h-3.5" />, 'Duplicar', () => duplicateNode(nodeId))}
      {item(<Power className="w-3.5 h-3.5" />, 'Habilitar/Desabilitar', () => toggleNodeDisabled(nodeId))}
      <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
      {item(<Trash2 className="w-3.5 h-3.5" />, 'Deletar', () => removeNode(nodeId), true)}
    </div>
  )
}
