import type { WFNode, WFEdge, NodeExecutionResult, NodeStatus } from '@/types/workflow'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function mockExecuteNode(node: WFNode): Promise<NodeExecutionResult> {
  const start = Date.now()
  await sleep(600 + Math.random() * 800)

  // 10% chance of simulated failure for non-trigger nodes
  if (node.data.nodeType !== 'trigger' && Math.random() < 0.1) {
    return {
      nodeId: node.id,
      status: 'error',
      error: 'Simulated execution error',
      durationMs: Date.now() - start,
    }
  }

  return {
    nodeId: node.id,
    status: 'success',
    output: { result: `Output from ${node.data.label}`, timestamp: new Date().toISOString() },
    durationMs: Date.now() - start,
  }
}

export async function executeWorkflow(
  nodes: WFNode[],
  edges: WFEdge[],
  onNodeStatusChange: (nodeId: string, status: NodeStatus) => void,
): Promise<NodeExecutionResult[]> {
  const results: NodeExecutionResult[] = []
  const visited = new Set<string>()

  // Topological traversal starting from triggers
  function getNextNodes(nodeId: string): string[] {
    return edges.filter((e) => e.source === nodeId).map((e) => e.target)
  }

  const triggers = nodes.filter((n) => n.data.nodeType === 'trigger')
  const queue = [...triggers.map((n) => n.id)]

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodes.find((n) => n.id === nodeId)
    if (!node || node.data.disabled) continue

    onNodeStatusChange(nodeId, 'running')
    const result = await mockExecuteNode(node)
    results.push(result)
    onNodeStatusChange(nodeId, result.status)

    if (result.status === 'success') {
      queue.push(...getNextNodes(nodeId))
    }
  }

  return results
}
