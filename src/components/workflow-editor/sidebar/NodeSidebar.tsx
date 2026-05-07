import React, { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NODE_DEFINITIONS, NODE_CATEGORIES } from '@/lib/workflow/nodeDefinitions'
import { cn } from '@/lib/utils'
import type { NodeType } from '@/types/workflow'

function DraggableNode({ type, label, color, icon: Icon, description }: {
  type: NodeType
  label: string
  color: string
  icon: React.ElementType
  description: string
}) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/workflow-node', type)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      title={description}
      className={cn(
        'group flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing',
        'border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700',
        'hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-all select-none',
      )}
    >
      <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', color)}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{label}</p>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">{description.slice(0, 45)}</p>
      </div>
    </div>
  )
}

export default function NodeSidebar() {
  const [search, setSearch] = useState('')

  const filtered = NODE_DEFINITIONS.filter(
    (d) =>
      d.label.toLowerCase().includes(search.toLowerCase()) ||
      d.description.toLowerCase().includes(search.toLowerCase()),
  )

  const byCategory = NODE_CATEGORIES.map((cat) => ({
    ...cat,
    nodes: filtered.filter((d) => d.category === cat.id),
  })).filter((c) => c.nodes.length > 0)

  return (
    <aside className="w-60 shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <div className="p-3 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2 px-1">
          Nós disponíveis
        </p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nós..."
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {byCategory.length === 0 && (
            <p className="text-xs text-zinc-400 text-center py-8">Nenhum nó encontrado</p>
          )}

          {byCategory.map((cat) => (
            <div key={cat.id}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 px-2 mb-1">
                {cat.label}
              </p>
              <div className="space-y-0.5">
                {cat.nodes.map((def) => (
                  <DraggableNode
                    key={def.type}
                    type={def.type}
                    label={def.label}
                    color={def.color}
                    icon={def.icon}
                    description={def.description}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 mt-4 border-t border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] text-zinc-400 text-center leading-relaxed">
            Arraste um nó para o canvas para adicioná-lo ao fluxo.
          </p>
        </div>
      </ScrollArea>
    </aside>
  )
}
