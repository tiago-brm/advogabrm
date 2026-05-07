import React, { useCallback, useEffect, useRef } from 'react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '@/stores/workflowStore'
import NodeSidebar from './sidebar/NodeSidebar'
import WorkflowCanvas from './canvas/WorkflowCanvas'
import NodeInspector from './inspector/NodeInspector'
import WorkflowToolbar from './WorkflowToolbar'

function EditorInner() {
  const { removeNode, duplicateNode, selectedNodeId } = useWorkflowStore()
  const { fitView } = useReactFlow()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (e.key === 'Delete' && selectedNodeId) {
        removeNode(selectedNodeId)
      }
      if (mod && e.key === 'd' && selectedNodeId) {
        e.preventDefault()
        duplicateNode(selectedNodeId)
      }
      if (mod && e.key === 's') {
        e.preventDefault()
        useWorkflowStore.getState().exportJSON()
      }
      if (mod && e.key === 'f') {
        e.preventDefault()
        fitView({ padding: 0.2, duration: 400 })
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedNodeId, removeNode, duplicateNode, fitView])

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        useWorkflowStore.getState().importJSON(ev.target?.result as string)
      } catch {
        alert('Arquivo de workflow inválido.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <WorkflowToolbar onImportClick={() => fileInputRef.current?.click()} />
      <div className="flex flex-1 overflow-hidden">
        <NodeSidebar />
        <WorkflowCanvas />
        <NodeInspector />
      </div>
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
    </div>
  )
}

export default function WorkflowEditor() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  )
}
