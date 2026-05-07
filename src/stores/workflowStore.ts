import { create } from 'zustand'
import { addEdge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { NodeChange, EdgeChange, Connection } from '@xyflow/react'
import type { WFNode, WFEdge, WorkflowNodeData, NodeStatus } from '@/types/workflow'
import { getNodeDef } from '@/lib/workflow/nodeDefinitions'
import { serializeWorkflow, exportWorkflowJSON, importWorkflowJSON, deserializeWorkflow } from '@/lib/workflow/serializer'
import { executeWorkflow } from '@/lib/workflow/executor'

let nodeCounter = 1

function createNode(
  nodeType: WFNode['data']['nodeType'],
  position: { x: number; y: number },
): WFNode {
  const def = getNodeDef(nodeType)
  return {
    id: `node_${nodeCounter++}`,
    type: 'workflowNode',
    position,
    data: {
      label: def.label,
      description: def.description,
      nodeType,
      status: 'idle',
      config: { ...def.defaultConfig } as WorkflowNodeData['config'],
      hasError: false,
      disabled: false,
    },
  }
}

interface WorkflowStore {
  // State
  workflowId: string
  workflowName: string
  workflowVersion: number
  nodes: WFNode[]
  edges: WFEdge[]
  selectedNodeId: string | null
  isExecuting: boolean
  isDirty: boolean

  // React Flow handlers
  onNodesChange: (changes: NodeChange<WFNode>[]) => void
  onEdgesChange: (changes: EdgeChange<WFEdge>[]) => void
  onConnect: (connection: Connection) => void

  // Node operations
  addNode: (nodeType: WFNode['data']['nodeType'], position: { x: number; y: number }) => void
  removeNode: (nodeId: string) => void
  duplicateNode: (nodeId: string) => void
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void
  updateNodeConfig: (nodeId: string, config: Partial<WorkflowNodeData['config']>) => void
  toggleNodeDisabled: (nodeId: string) => void
  setNodeStatus: (nodeId: string, status: NodeStatus) => void

  // Selection
  setSelectedNodeId: (id: string | null) => void
  getSelectedNode: () => WFNode | undefined

  // Workflow operations
  setWorkflowName: (name: string) => void
  resetWorkflow: () => void
  executeWorkflow: () => Promise<void>
  exportJSON: () => void
  importJSON: (json: string) => void
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflowId: `wf_${Date.now()}`,
  workflowName: 'Novo Workflow',
  workflowVersion: 1,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isExecuting: false,
  isDirty: false,

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes), isDirty: true })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges), isDirty: true })),

  onConnect: (connection) =>
    set((s) => ({
      edges: addEdge({ ...connection, type: 'smoothstep', animated: false }, s.edges),
      isDirty: true,
    })),

  addNode: (nodeType, position) => {
    const node = createNode(nodeType, position)
    set((s) => ({ nodes: [...s.nodes, node], isDirty: true }))
  },

  removeNode: (nodeId) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId,
      isDirty: true,
    })),

  duplicateNode: (nodeId) => {
    const source = get().nodes.find((n) => n.id === nodeId)
    if (!source) return
    const dup: WFNode = {
      ...source,
      id: `node_${nodeCounter++}`,
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      selected: false,
    }
    set((s) => ({ nodes: [...s.nodes, dup], isDirty: true }))
  },

  updateNodeData: (nodeId, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
      ),
      isDirty: true,
    })),

  updateNodeConfig: (nodeId, config) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } }
          : n,
      ),
      isDirty: true,
    })),

  toggleNodeDisabled: (nodeId) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, disabled: !n.data.disabled, status: 'idle' } } : n,
      ),
      isDirty: true,
    })),

  setNodeStatus: (nodeId, status) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, status } } : n,
      ),
    })),

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  getSelectedNode: () => {
    const { nodes, selectedNodeId } = get()
    return nodes.find((n) => n.id === selectedNodeId)
  },

  setWorkflowName: (name) => set({ workflowName: name, isDirty: true }),

  resetWorkflow: () => {
    nodeCounter = 1
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      isDirty: false,
      workflowId: `wf_${Date.now()}`,
      workflowName: 'Novo Workflow',
      workflowVersion: 1,
    })
  },

  executeWorkflow: async () => {
    const { nodes, edges, setNodeStatus } = get()

    // Reset all statuses
    set((s) => ({
      isExecuting: true,
      nodes: s.nodes.map((n) => ({ ...n, data: { ...n.data, status: 'idle' as NodeStatus } })),
    }))

    await executeWorkflow(nodes, edges, (nodeId, status) => {
      setNodeStatus(nodeId, status)
    })

    set({ isExecuting: false })
  },

  exportJSON: () => {
    const { nodes, edges, workflowName, workflowId, workflowVersion } = get()
    const workflow = serializeWorkflow(nodes, edges, workflowName, workflowId, workflowVersion)
    const json = exportWorkflowJSON(workflow)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workflowName.replace(/\s+/g, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  },

  importJSON: (json) => {
    try {
      const workflow = importWorkflowJSON(json)
      const { nodes, edges } = deserializeWorkflow(workflow)
      nodeCounter = nodes.length + 1
      set({
        nodes,
        edges,
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowVersion: workflow.version,
        selectedNodeId: null,
        isDirty: false,
      })
    } catch (err: unknown) {
      throw err
    }
  },
}))
