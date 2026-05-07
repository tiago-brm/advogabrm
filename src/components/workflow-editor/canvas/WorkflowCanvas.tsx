import React, { useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  SelectionMode,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkflowStore } from '@/stores/workflowStore'
import { nodeTypes } from '../nodes/nodeTypes'
import { NODE_DEFINITIONS } from '@/lib/workflow/nodeDefinitions'
import type { NodeType, WFNode } from '@/types/workflow'
import NodeContextMenu from './NodeContextMenu'

export default function WorkflowCanvas() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    addNode, setSelectedNodeId,
  } = useWorkflowStore()

  const { screenToFlowPosition } = useReactFlow()
  const [menu, setMenu] = React.useState<{ nodeId: string; x: number; y: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const nodeType = e.dataTransfer.getData('application/workflow-node') as NodeType
      if (!nodeType || !NODE_DEFINITIONS.find((d) => d.type === nodeType)) return

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addNode(nodeType, position)
    },
    [screenToFlowPosition, addNode],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: WFNode) => {
      setSelectedNodeId(node.id)
      setMenu(null)
    },
    [setSelectedNodeId],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setMenu(null)
  }, [setSelectedNodeId])

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: WFNode) => {
    e.preventDefault()
    setMenu({ nodeId: node.id, x: e.clientX, y: e.clientY })
  }, [])

  return (
    <div ref={canvasRef} className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
        selectionMode={SelectionMode.Partial}
        snapToGrid
        snapGrid={[16, 16]}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        className="bg-zinc-50 dark:bg-zinc-950"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          className="!fill-zinc-300 dark:!fill-zinc-700"
        />
        <Controls className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-700 !rounded-lg !shadow-sm" />
        <MiniMap
          className="!bg-white dark:!bg-zinc-900 !border !border-zinc-200 dark:!border-zinc-700 !rounded-lg"
          nodeColor={(n) => {
            const data = n.data as { nodeType?: string }
            const def = NODE_DEFINITIONS.find((d) => d.type === data.nodeType)
            return def ? '' : '#a1a1aa'
          }}
          maskColor="rgba(0,0,0,0.05)"
        />
      </ReactFlow>

      {menu && (
        <NodeContextMenu
          nodeId={menu.nodeId}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
