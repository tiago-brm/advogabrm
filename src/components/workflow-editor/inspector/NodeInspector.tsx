import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { X, AlertCircle } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflowStore'
import { NODE_SCHEMAS } from '@/lib/workflow/schemas'
import { getNodeDef } from '@/lib/workflow/nodeDefinitions'
import type { WFNode, NodeType } from '@/types/workflow'
import { cn } from '@/lib/utils'

// ── Generic field ────────────────────────────────────────────
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-zinc-600 dark:text-zinc-400">{label}</Label>
      {children}
      {error && <p className="text-[10px] text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
    </div>
  )
}

// ── Config forms per node type ───────────────────────────────
function ConfigForm({ node }: { node: WFNode }) {
  const { updateNodeConfig, updateNodeData } = useWorkflowStore()
  const schema = NODE_SCHEMAS[node.data.nodeType as NodeType]
  const { register, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: node.data.config as Record<string, unknown>,
    mode: 'onChange',
  })

  const update = (key: string, value: unknown) => {
    updateNodeConfig(node.id, { [key]: value } as Partial<typeof node.data.config>)
  }

  const t = node.data.nodeType

  if (t === 'trigger') return (
    <div className="space-y-4">
      <Field label="Tipo de gatilho" error={(errors as Record<string, {message?: string}>).triggerType?.message}>
        <Select
          defaultValue={(node.data.config as {triggerType: string}).triggerType}
          onValueChange={(v) => { setValue('triggerType', v); update('triggerType', v) }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="schedule">Agendado (cron)</SelectItem>
            <SelectItem value="event">Evento</SelectItem>
            <SelectItem value="processo_prazo">Prazo de processo</SelectItem>
            <SelectItem value="lancamento_vencimento">Vencimento de lançamento</SelectItem>
            <SelectItem value="processo_inatividade">Processo sem movimentação</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {watch('triggerType') === 'schedule' && (
        <Field label="Expressão cron" error={(errors as Record<string, {message?: string}>).schedule?.message}>
          <Input {...register('schedule', { onChange: (e) => update('schedule', e.target.value) })} className="h-8 text-xs font-mono" placeholder="0 * * * *" />
        </Field>
      )}
      {watch('triggerType') === 'webhook' && (
        <Field label="Caminho do webhook" error={(errors as Record<string, {message?: string}>).webhookPath?.message}>
          <Input {...register('webhookPath', { onChange: (e) => update('webhookPath', e.target.value) })} className="h-8 text-xs font-mono" placeholder="/webhook/meu-fluxo" />
        </Field>
      )}
      {(watch('triggerType') === 'processo_prazo' || watch('triggerType') === 'lancamento_vencimento') && (
        <Field label="Dias de antecedência" error={(errors as Record<string, {message?: string}>).diasAntecedencia?.message}>
          <Input
            type="number" min={1} max={90}
            {...register('diasAntecedencia', { valueAsNumber: true, onChange: (e) => update('diasAntecedencia', Number(e.target.value)) })}
            className="h-8 text-xs"
            placeholder="Ex: 3"
          />
          <p className="text-[10px] text-muted-foreground">
            {watch('triggerType') === 'processo_prazo'
              ? 'Dispara quando o prazo do processo estiver a N dias.'
              : 'Dispara quando o vencimento do lançamento estiver a N dias.'}
          </p>
        </Field>
      )}
      {watch('triggerType') === 'processo_inatividade' && (
        <Field label="Dias sem movimentação" error={(errors as Record<string, {message?: string}>).diasInatividade?.message}>
          <Input
            type="number" min={1} max={365}
            {...register('diasInatividade', { valueAsNumber: true, onChange: (e) => update('diasInatividade', Number(e.target.value)) })}
            className="h-8 text-xs"
            placeholder="Ex: 30"
          />
          <p className="text-[10px] text-muted-foreground">
            Dispara quando um processo não tiver atualização há N dias.
          </p>
        </Field>
      )}
    </div>
  )

  if (t === 'http-request') return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="w-28">
          <Field label="Método" error={(errors as Record<string, {message?: string}>).method?.message}>
            <Select defaultValue={(node.data.config as {method: string}).method} onValueChange={(v) => { setValue('method', v); update('method', v) }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['GET','POST','PUT','PATCH','DELETE'].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex-1">
          <Field label="URL" error={(errors as Record<string, {message?: string}>).url?.message}>
            <Input {...register('url', { onChange: (e) => update('url', e.target.value) })} className="h-8 text-xs font-mono" placeholder="https://api.exemplo.com/v1" />
          </Field>
        </div>
      </div>
      <Field label="Body (JSON)" error={(errors as Record<string, {message?: string}>).body?.message}>
        <Textarea {...register('body', { onChange: (e) => update('body', e.target.value) })} className="text-xs font-mono min-h-[80px]" placeholder='{"key": "value"}' />
      </Field>
      <Field label="Timeout (segundos)" error={(errors as Record<string, {message?: string}>).timeout?.message}>
        <Input type="number" {...register('timeout', { valueAsNumber: true, onChange: (e) => update('timeout', Number(e.target.value)) })} className="h-8 text-xs" />
      </Field>
    </div>
  )

  if (t === 'condition') return (
    <div className="space-y-4">
      <Field label="Expressão (campo ou variável)" error={(errors as Record<string, {message?: string}>).expression?.message}>
        <Input {...register('expression', { onChange: (e) => update('expression', e.target.value) })} className="h-8 text-xs font-mono" placeholder="{{data.status}}" />
      </Field>
      <Field label="Operador" error={(errors as Record<string, {message?: string}>).operator?.message}>
        <Select defaultValue={(node.data.config as {operator: string}).operator} onValueChange={(v) => { setValue('operator', v); update('operator', v) }}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['==','!=','>','<','>=','<=','contains','startsWith'].map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Valor esperado" error={(errors as Record<string, {message?: string}>).value?.message}>
        <Input {...register('value', { onChange: (e) => update('value', e.target.value) })} className="h-8 text-xs" placeholder="200" />
      </Field>
    </div>
  )

  if (t === 'delay') return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Field label="Duração" error={(errors as Record<string, {message?: string}>).amount?.message}>
          <Input type="number" min={1} {...register('amount', { valueAsNumber: true, onChange: (e) => update('amount', Number(e.target.value)) })} className="h-8 text-xs" />
        </Field>
      </div>
      <div className="w-32">
        <Field label="Unidade">
          <Select defaultValue={(node.data.config as {unit: string}).unit} onValueChange={(v) => { setValue('unit', v); update('unit', v) }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="seconds">Segundos</SelectItem>
              <SelectItem value="minutes">Minutos</SelectItem>
              <SelectItem value="hours">Horas</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  )

  if (t === 'ai-agent') return (
    <div className="space-y-4">
      <Field label="Modelo" error={(errors as Record<string, {message?: string}>).model?.message}>
        <Select defaultValue={(node.data.config as {model: string}).model} onValueChange={(v) => { setValue('model', v); update('model', v) }}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4.6</SelectItem>
            <SelectItem value="claude-opus-4-7">Claude Opus 4.7</SelectItem>
            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
            <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Prompt do sistema" error={(errors as Record<string, {message?: string}>).systemPrompt?.message}>
        <Textarea {...register('systemPrompt', { onChange: (e) => update('systemPrompt', e.target.value) })} className="text-xs min-h-[60px]" placeholder="Você é um assistente especializado em..." />
      </Field>
      <Field label="Prompt do usuário" error={(errors as Record<string, {message?: string}>).prompt?.message}>
        <Textarea {...register('prompt', { onChange: (e) => update('prompt', e.target.value) })} className="text-xs min-h-[80px]" placeholder="Analise os dados a seguir: {{input}}" />
      </Field>
      <Field label={`Temperatura: ${watch('temperature') ?? 0.7}`}>
        <input type="range" min={0} max={2} step={0.1}
          {...register('temperature', { valueAsNumber: true, onChange: (e) => update('temperature', Number(e.target.value)) })}
          className="w-full accent-fuchsia-500"
        />
      </Field>
    </div>
  )

  if (t === 'send-email') return (
    <div className="space-y-4">
      <Field label="Para" error={(errors as Record<string, {message?: string}>).to?.message}>
        <Input {...register('to', { onChange: (e) => update('to', e.target.value) })} className="h-8 text-xs" placeholder="destino@exemplo.com" />
      </Field>
      <Field label="CC (opcional)">
        <Input {...register('cc', { onChange: (e) => update('cc', e.target.value) })} className="h-8 text-xs" placeholder="cc@exemplo.com" />
      </Field>
      <Field label="Assunto" error={(errors as Record<string, {message?: string}>).subject?.message}>
        <Input {...register('subject', { onChange: (e) => update('subject', e.target.value) })} className="h-8 text-xs" placeholder="Notificação automática" />
      </Field>
      <Field label="Corpo" error={(errors as Record<string, {message?: string}>).body?.message}>
        <Textarea {...register('body', { onChange: (e) => update('body', e.target.value) })} className="text-xs min-h-[100px]" placeholder="Olá, este é um email automático..." />
      </Field>
      <div className="flex items-center gap-2">
        <Switch id="html" onCheckedChange={(v) => update('isHtml', v)} />
        <Label htmlFor="html" className="text-xs text-zinc-600 dark:text-zinc-400">Enviar como HTML</Label>
      </div>
    </div>
  )

  if (t === 'database-query') return (
    <div className="space-y-4">
      <Field label="Conexão" error={(errors as Record<string, {message?: string}>).connection?.message}>
        <Select defaultValue={(node.data.config as {connection: string}).connection} onValueChange={(v) => { setValue('connection', v); update('connection', v) }}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="supabase">Supabase (padrão)</SelectItem>
            <SelectItem value="custom">Conexão personalizada</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Query SQL" error={(errors as Record<string, {message?: string}>).query?.message}>
        <Textarea {...register('query', { onChange: (e) => update('query', e.target.value) })} className="text-xs font-mono min-h-[100px]" placeholder="SELECT * FROM tabela WHERE id = $1" />
      </Field>
      <Field label="Parâmetros (JSON)" error={(errors as Record<string, {message?: string}>).parameters?.message}>
        <Input {...register('parameters', { onChange: (e) => update('parameters', e.target.value) })} className="h-8 text-xs font-mono" placeholder='["valor1", "valor2"]' />
      </Field>
    </div>
  )

  if (t === 'transform') return (
    <div className="space-y-4">
      <Field label="Modo" error={(errors as Record<string, {message?: string}>).mode?.message}>
        <Select defaultValue={(node.data.config as {mode: string}).mode} onValueChange={(v) => { setValue('mode', v); update('mode', v) }}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="map">Map</SelectItem>
            <SelectItem value="filter">Filter</SelectItem>
            <SelectItem value="reduce">Reduce</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Expressão" error={(errors as Record<string, {message?: string}>).expression?.message}>
        <Textarea {...register('expression', { onChange: (e) => update('expression', e.target.value) })} className="text-xs font-mono min-h-[80px]" placeholder="item => ({ ...item, processed: true })" />
      </Field>
    </div>
  )

  return null
}

// ── Main inspector ───────────────────────────────────────────
export default function NodeInspector() {
  const { selectedNodeId, getSelectedNode, updateNodeData, setSelectedNodeId, nodes } = useWorkflowStore()

  const node = getSelectedNode()

  if (!node) {
    return (
      <aside className="w-72 shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col items-center justify-center text-center p-6">
        <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
          <X className="w-5 h-5 text-zinc-400" />
        </div>
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Nenhum nó selecionado</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Clique em um nó no canvas para editar suas propriedades.</p>
      </aside>
    )
  }

  const def = getNodeDef(node.data.nodeType)
  const Icon = def.icon

  return (
    <aside className="w-72 shrink-0 flex flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className={cn('flex items-center gap-3 px-4 py-3', def.color)}>
        <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center">
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{node.data.label}</p>
          <p className="text-white/70 text-[10px]">{def.label}</p>
        </div>
        <button onClick={() => setSelectedNodeId(null)} className="text-white/70 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <Tabs defaultValue="config" className="flex-1">
          <TabsList className="w-full rounded-none border-b border-zinc-100 dark:border-zinc-800 bg-transparent h-9 px-1">
            <TabsTrigger value="config" className="flex-1 text-xs h-7">Configuração</TabsTrigger>
            <TabsTrigger value="io" className="flex-1 text-xs h-7">Entradas/Saídas</TabsTrigger>
            <TabsTrigger value="advanced" className="flex-1 text-xs h-7">Avançado</TabsTrigger>
          </TabsList>

          {/* Config tab */}
          <TabsContent value="config" className="p-4 space-y-4 mt-0">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-500">Nome do nó</Label>
              <Input
                value={node.data.label}
                onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-500">Descrição</Label>
              <Textarea
                value={node.data.description}
                onChange={(e) => updateNodeData(node.id, { description: e.target.value })}
                className="text-xs min-h-[50px]"
              />
            </div>

            <Separator />

            <ConfigForm key={node.id} node={node} />
          </TabsContent>

          {/* I/O tab */}
          <TabsContent value="io" className="p-4 space-y-4 mt-0">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Entradas</p>
              {def.inputs.length === 0
                ? <p className="text-xs text-zinc-400">Nenhuma entrada (nó inicial)</p>
                : def.inputs.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 py-1.5">
                    <div className="w-2 h-2 rounded-full bg-zinc-400 border border-zinc-300" />
                    <span className="text-xs text-zinc-600 dark:text-zinc-300">{h.label}</span>
                    <span className="text-[10px] text-zinc-400 font-mono ml-auto">id: {h.id}</span>
                  </div>
                ))
              }
            </div>
            <Separator />
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Saídas</p>
              {def.outputs.map((h) => (
                <div key={h.id} className="flex items-center gap-2 py-1.5">
                  <div className="w-2 h-2 rounded-full bg-primary border border-primary/50" />
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">{h.label}</span>
                  <span className="text-[10px] text-zinc-400 font-mono ml-auto">id: {h.id}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Advanced tab */}
          <TabsContent value="advanced" className="p-4 space-y-4 mt-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Nó desabilitado</p>
                <p className="text-[10px] text-zinc-400">O nó é ignorado durante a execução</p>
              </div>
              <Switch
                checked={node.data.disabled}
                onCheckedChange={() => useWorkflowStore.getState().toggleNodeDisabled(node.id)}
              />
            </div>
            <Separator />
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-zinc-400">ID: {node.id}</p>
              <p className="text-[10px] font-mono text-zinc-400">Tipo: {node.data.nodeType}</p>
              <p className="text-[10px] font-mono text-zinc-400">
                Status: {node.data.status}
              </p>
              <p className="text-[10px] font-mono text-zinc-400">
                Posição: x={Math.round(node.position.x)}, y={Math.round(node.position.y)}
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </ScrollArea>
    </aside>
  )
}
