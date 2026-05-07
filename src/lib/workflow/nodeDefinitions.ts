import {
  Zap, Globe, GitBranch, Timer, Shuffle, Bot, Mail, Database,
} from 'lucide-react'
import type { NodeCategory, NodeType, NodeConfig } from '@/types/workflow'

export interface HandleDef {
  id: string
  label: string
}

export interface NodeDefinition {
  type: NodeType
  label: string
  category: NodeCategory
  icon: React.ElementType
  color: string       // Tailwind bg class for header
  borderColor: string // Tailwind border class
  description: string
  defaultConfig: NodeConfig
  inputs: HandleDef[]
  outputs: HandleDef[]
}

export const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'trigger',
    label: 'Trigger',
    category: 'triggers',
    icon: Zap,
    color: 'bg-amber-500',
    borderColor: 'border-amber-400',
    description: 'Inicia o fluxo manualmente, via webhook ou agendamento.',
    defaultConfig: { triggerType: 'manual' },
    inputs: [],
    outputs: [{ id: 'out', label: 'Saída' }],
  },
  {
    type: 'http-request',
    label: 'HTTP Request',
    category: 'actions',
    icon: Globe,
    color: 'bg-blue-500',
    borderColor: 'border-blue-400',
    description: 'Faz uma requisição HTTP para uma URL externa.',
    defaultConfig: { method: 'GET', url: '', timeout: 30 },
    inputs: [{ id: 'in', label: 'Entrada' }],
    outputs: [
      { id: 'success', label: 'Sucesso' },
      { id: 'error', label: 'Erro' },
    ],
  },
  {
    type: 'condition',
    label: 'Condição',
    category: 'logic',
    icon: GitBranch,
    color: 'bg-violet-500',
    borderColor: 'border-violet-400',
    description: 'Ramifica o fluxo com base em uma expressão.',
    defaultConfig: { expression: '', operator: '==', value: '' },
    inputs: [{ id: 'in', label: 'Entrada' }],
    outputs: [
      { id: 'true', label: 'Verdadeiro' },
      { id: 'false', label: 'Falso' },
    ],
  },
  {
    type: 'delay',
    label: 'Delay',
    category: 'logic',
    icon: Timer,
    color: 'bg-slate-500',
    borderColor: 'border-slate-400',
    description: 'Aguarda um tempo antes de continuar.',
    defaultConfig: { amount: 5, unit: 'seconds' },
    inputs: [{ id: 'in', label: 'Entrada' }],
    outputs: [{ id: 'out', label: 'Saída' }],
  },
  {
    type: 'transform',
    label: 'Transform',
    category: 'data',
    icon: Shuffle,
    color: 'bg-teal-500',
    borderColor: 'border-teal-400',
    description: 'Transforma dados com map, filter ou expressão custom.',
    defaultConfig: { mode: 'map', expression: '' },
    inputs: [{ id: 'in', label: 'Entrada' }],
    outputs: [{ id: 'out', label: 'Saída' }],
  },
  {
    type: 'ai-agent',
    label: 'AI Agent',
    category: 'ai',
    icon: Bot,
    color: 'bg-fuchsia-500',
    borderColor: 'border-fuchsia-400',
    description: 'Processa dados com um modelo de linguagem.',
    defaultConfig: { model: 'claude-sonnet-4-6', prompt: '', temperature: 0.7 },
    inputs: [{ id: 'in', label: 'Entrada' }],
    outputs: [{ id: 'out', label: 'Resposta' }],
  },
  {
    type: 'send-email',
    label: 'Enviar Email',
    category: 'actions',
    icon: Mail,
    color: 'bg-green-500',
    borderColor: 'border-green-400',
    description: 'Envia um e-mail via SMTP configurado.',
    defaultConfig: { to: '', subject: '', body: '', isHtml: false },
    inputs: [{ id: 'in', label: 'Entrada' }],
    outputs: [{ id: 'out', label: 'Saída' }],
  },
  {
    type: 'database-query',
    label: 'Database Query',
    category: 'data',
    icon: Database,
    color: 'bg-orange-500',
    borderColor: 'border-orange-400',
    description: 'Executa uma query no banco de dados.',
    defaultConfig: { connection: 'supabase', query: '' },
    inputs: [{ id: 'in', label: 'Entrada' }],
    outputs: [
      { id: 'rows', label: 'Linhas' },
      { id: 'error', label: 'Erro' },
    ],
  },
]

export const NODE_CATEGORIES: { id: NodeCategory; label: string }[] = [
  { id: 'triggers', label: 'Gatilhos' },
  { id: 'actions', label: 'Ações' },
  { id: 'logic', label: 'Lógica' },
  { id: 'ai', label: 'Inteligência Artificial' },
  { id: 'data', label: 'Dados' },
]

export function getNodeDef(type: NodeType): NodeDefinition {
  return NODE_DEFINITIONS.find((d) => d.type === type)!
}
