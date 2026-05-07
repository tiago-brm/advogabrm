import type { Node, Edge } from '@xyflow/react'

// ─── Node types ────────────────────────────────────────────
export type NodeType =
  | 'trigger'
  | 'http-request'
  | 'condition'
  | 'delay'
  | 'transform'
  | 'ai-agent'
  | 'send-email'
  | 'database-query'

export type NodeCategory = 'triggers' | 'actions' | 'logic' | 'ai' | 'data'

export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'disabled'

// Config payloads per node type
export interface TriggerConfig {
  triggerType: 'manual' | 'webhook' | 'schedule' | 'event' | 'processo_prazo' | 'lancamento_vencimento' | 'processo_inatividade'
  schedule?: string
  webhookPath?: string
  eventName?: string
  diasAntecedencia?: number   // processo_prazo e lancamento_vencimento
  diasInatividade?: number    // processo_inatividade
}

export interface HttpRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  headers?: Record<string, string>
  body?: string
  timeout?: number
}

export interface ConditionConfig {
  expression: string
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'startsWith'
  value: string
}

export interface DelayConfig {
  amount: number
  unit: 'seconds' | 'minutes' | 'hours'
}

export interface TransformConfig {
  mode: 'map' | 'filter' | 'reduce' | 'custom'
  expression: string
}

export interface AIAgentConfig {
  model: 'gpt-4o' | 'gpt-4o-mini' | 'claude-opus-4-7' | 'claude-sonnet-4-6'
  prompt: string
  temperature: number
  maxTokens?: number
  systemPrompt?: string
}

export interface SendEmailConfig {
  to: string
  subject: string
  body: string
  cc?: string
  isHtml?: boolean
}

export interface DatabaseQueryConfig {
  connection: string
  query: string
  parameters?: string
}

export type NodeConfig =
  | TriggerConfig
  | HttpRequestConfig
  | ConditionConfig
  | DelayConfig
  | TransformConfig
  | AIAgentConfig
  | SendEmailConfig
  | DatabaseQueryConfig

// ─── Node data (stored inside React Flow Node) ─────────────
export interface WorkflowNodeData extends Record<string, unknown> {
  label: string
  description: string
  nodeType: NodeType
  status: NodeStatus
  config: NodeConfig
  hasError: boolean
  errorMessage?: string
  disabled: boolean
}

// ─── React Flow typed aliases ───────────────────────────────
export type WFNode = Node<WorkflowNodeData>
export type WFEdge = Edge<{ label?: string; metadata?: Record<string, unknown> }>

// ─── Serialization format ───────────────────────────────────
export interface SerializedNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  data: WorkflowNodeData
  config: NodeConfig
  validation: { isValid: boolean; errors: string[] }
  ui: { selected: boolean; collapsed: boolean; color?: string }
}

export interface SerializedEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  label?: string
  metadata?: Record<string, unknown>
}

export interface WorkflowVariables {
  [key: string]: string | number | boolean
}

export interface ExecutionSettings {
  timeout: number
  retries: number
  stopOnError: boolean
  concurrency: number
}

export interface WorkflowMetadata {
  author?: string
  tags?: string[]
  category?: string
  description?: string
}

export interface Workflow {
  id: string
  name: string
  version: number
  nodes: SerializedNode[]
  edges: SerializedEdge[]
  variables: WorkflowVariables
  executionSettings: ExecutionSettings
  createdAt: string
  updatedAt: string
  metadata: WorkflowMetadata
}

// ─── Execution result ───────────────────────────────────────
export interface NodeExecutionResult {
  nodeId: string
  status: NodeStatus
  output?: unknown
  error?: string
  durationMs: number
}
