import { z } from 'zod'

export const triggerSchema = z.object({
  triggerType: z.enum(['manual', 'webhook', 'schedule', 'event']),
  schedule: z.string().optional(),
  webhookPath: z.string().optional(),
  eventName: z.string().optional(),
})

export const httpRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string().url('URL inválida'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeout: z.number().min(1).max(300).optional(),
})

export const conditionSchema = z.object({
  expression: z.string().min(1, 'Expressão obrigatória'),
  operator: z.enum(['==', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith']),
  value: z.string(),
})

export const delaySchema = z.object({
  amount: z.number().min(1, 'Mínimo 1'),
  unit: z.enum(['seconds', 'minutes', 'hours']),
})

export const transformSchema = z.object({
  mode: z.enum(['map', 'filter', 'reduce', 'custom']),
  expression: z.string().min(1, 'Expressão obrigatória'),
})

export const aiAgentSchema = z.object({
  model: z.enum(['gpt-4o', 'gpt-4o-mini', 'claude-opus-4-7', 'claude-sonnet-4-6']),
  prompt: z.string().min(1, 'Prompt obrigatório'),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().optional(),
  systemPrompt: z.string().optional(),
})

export const sendEmailSchema = z.object({
  to: z.string().email('Email inválido'),
  subject: z.string().min(1, 'Assunto obrigatório'),
  body: z.string().min(1, 'Corpo obrigatório'),
  cc: z.string().optional(),
  isHtml: z.boolean().optional(),
})

export const databaseQuerySchema = z.object({
  connection: z.string().min(1, 'Conexão obrigatória'),
  query: z.string().min(1, 'Query obrigatória'),
  parameters: z.string().optional(),
})

export const NODE_SCHEMAS = {
  'trigger': triggerSchema,
  'http-request': httpRequestSchema,
  'condition': conditionSchema,
  'delay': delaySchema,
  'transform': transformSchema,
  'ai-agent': aiAgentSchema,
  'send-email': sendEmailSchema,
  'database-query': databaseQuerySchema,
} as const
