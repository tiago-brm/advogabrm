import type { WFNode, WFEdge, Workflow, SerializedNode, SerializedEdge } from '@/types/workflow'

export function serializeWorkflow(
  nodes: WFNode[],
  edges: WFEdge[],
  name: string,
  id: string,
  version = 1,
): Workflow {
  const serializedNodes: SerializedNode[] = nodes.map((n) => ({
    id: n.id,
    type: n.data.nodeType,
    position: n.position,
    data: n.data,
    config: n.data.config,
    validation: { isValid: !n.data.hasError, errors: n.data.errorMessage ? [n.data.errorMessage] : [] },
    ui: { selected: n.selected ?? false, collapsed: false },
  }))

  const serializedEdges: SerializedEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: typeof e.label === 'string' ? e.label : undefined,
    metadata: e.data?.metadata,
  }))

  return {
    id,
    name,
    version,
    nodes: serializedNodes,
    edges: serializedEdges,
    variables: {},
    executionSettings: { timeout: 30, retries: 0, stopOnError: true, concurrency: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {},
  }
}

export function deserializeWorkflow(workflow: Workflow): { nodes: WFNode[]; edges: WFEdge[] } {
  const nodes: WFNode[] = workflow.nodes.map((n) => ({
    id: n.id,
    type: 'workflowNode',
    position: n.position,
    data: { ...n.data, nodeType: n.type },
  }))

  const edges: WFEdge[] = workflow.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    type: 'smoothstep',
    label: e.label,
    data: { metadata: e.metadata },
  }))

  return { nodes, edges }
}

export function exportWorkflowJSON(workflow: Workflow): string {
  return JSON.stringify(workflow, null, 2)
}

export function importWorkflowJSON(json: string): Workflow {
  try {
    const parsed = JSON.parse(json)
    if (!parsed.id || !parsed.nodes || !parsed.edges) {
      throw new Error('Formato de workflow inválido')
    }
    return parsed as Workflow
  } catch {
    throw new Error('JSON inválido ou estrutura de workflow incorreta')
  }
}
