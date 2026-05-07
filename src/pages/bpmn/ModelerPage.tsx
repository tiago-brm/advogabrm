import React, { useEffect, useRef, useState, useCallback } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Save, FileDown, Upload, Loader2, Plus, Workflow, Maximize2, FilePen,
  Trash2, ChevronRight, Play, Square, User, Bot, Mail, Terminal,
  GitBranch, GitMerge, Info, Settings, Cpu,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { BPMNTemplate } from '@/types/bpmn';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// ─── Blank diagram ──────────────────────────────────────────────────────────
const BLANK_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Início" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="196" y="132" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="189" y="175" width="50" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// ─── BPMN element palette definition ───────────────────────────────────────
const BPMN_PALETTE = [
  {
    category: 'Eventos',
    items: [
      { bpmnType: 'bpmn:StartEvent',            label: 'Início',             icon: Play,      color: 'bg-green-500' },
      { bpmnType: 'bpmn:EndEvent',              label: 'Fim',                icon: Square,    color: 'bg-red-500'   },
    ],
  },
  {
    category: 'Tarefas',
    items: [
      { bpmnType: 'bpmn:UserTask',              label: 'Tarefa Humana',      icon: User,      color: 'bg-blue-500'    },
      { bpmnType: 'bpmn:ServiceTask',           label: 'Service Task (RPA)', icon: Bot,       color: 'bg-fuchsia-500' },
      { bpmnType: 'bpmn:SendTask',              label: 'Enviar Mensagem',    icon: Mail,      color: 'bg-indigo-500'  },
      { bpmnType: 'bpmn:ScriptTask',            label: 'Script',             icon: Terminal,  color: 'bg-slate-500'   },
    ],
  },
  {
    category: 'Gateways',
    items: [
      { bpmnType: 'bpmn:ExclusiveGateway',      label: 'Exclusivo (XOR)',    icon: GitBranch, color: 'bg-orange-500' },
      { bpmnType: 'bpmn:ParallelGateway',       label: 'Paralelo (AND)',     icon: GitMerge,  color: 'bg-amber-500'  },
      { bpmnType: 'bpmn:InclusiveGateway',      label: 'Inclusivo (OR)',     icon: Cpu,       color: 'bg-teal-500'   },
    ],
  },
] as const;

// Filas RPA disponíveis (sincronizado com worker.js)
const RPA_QUEUES = [
  { value: 'emissor_guia_tjms',  label: 'Emissor de Guia (TJMS)' },
  { value: 'triagem_datajud',    label: 'Triagem DataJud'         },
  { value: 'custom',             label: 'Fila personalizada…'    },
];

// ─── Types ──────────────────────────────────────────────────────────────────
interface RpaConfig {
  queue: string;
  payload: string; // JSON string
}

interface SelectedElement {
  id: string;
  type: string; // e.g. 'bpmn:ServiceTask'
  businessObject: Record<string, unknown>;
}

// ─── Sub-component: Element palette item ────────────────────────────────────
function PaletteItem({
  label, icon: Icon, color, onMouseDown,
}: {
  label: string;
  icon: React.ElementType;
  color: string;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing select-none',
        'border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700',
        'hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-all',
      )}
      title={`Arraste para o canvas: ${label}`}
    >
      <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', color)}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
    </div>
  );
}

// ─── Sub-component: Inspector field wrapper ──────────────────────────────────
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-zinc-400">{hint}</p>}
    </div>
  );
}

// ─── Sub-component: Element inspector ───────────────────────────────────────
function ElementInspector({
  element,
  rpaConfig,
  onNameChange,
  onDocChange,
  onConditionChange,
  onRpaChange,
}: {
  element: SelectedElement;
  rpaConfig: RpaConfig;
  onNameChange: (v: string) => void;
  onDocChange: (v: string) => void;
  onConditionChange: (v: string) => void;
  onRpaChange: (cfg: Partial<RpaConfig>) => void;
}) {
  const type = element.type;
  const bo = element.businessObject;
  const name = (bo.name as string) ?? '';
  const doc = ((bo.documentation as any[])?.[0]?.text as string) ?? '';
  const conditionExpr = (bo.conditionExpression as any)?.body ?? '';
  const isServiceTask = type === 'bpmn:ServiceTask';
  const isUserTask    = type === 'bpmn:UserTask';
  const isFlow        = type === 'bpmn:SequenceFlow';

  const typeLabel: Record<string, string> = {
    'bpmn:StartEvent':        'Evento de Início',
    'bpmn:EndEvent':          'Evento de Fim',
    'bpmn:UserTask':          'Tarefa Humana',
    'bpmn:ServiceTask':       'Service Task',
    'bpmn:SendTask':          'Tarefa de Envio',
    'bpmn:ScriptTask':        'Tarefa de Script',
    'bpmn:ExclusiveGateway':  'Gateway Exclusivo (XOR)',
    'bpmn:ParallelGateway':   'Gateway Paralelo (AND)',
    'bpmn:InclusiveGateway':  'Gateway Inclusivo (OR)',
    'bpmn:SequenceFlow':      'Fluxo de Sequência',
    'bpmn:SubProcess':        'Subprocesso',
  };

  const typeColor: Record<string, string> = {
    'bpmn:StartEvent':        'bg-green-500',
    'bpmn:EndEvent':          'bg-red-500',
    'bpmn:UserTask':          'bg-blue-500',
    'bpmn:ServiceTask':       'bg-fuchsia-500',
    'bpmn:SendTask':          'bg-indigo-500',
    'bpmn:ScriptTask':        'bg-slate-500',
    'bpmn:ExclusiveGateway':  'bg-orange-500',
    'bpmn:ParallelGateway':   'bg-amber-500',
    'bpmn:InclusiveGateway':  'bg-teal-500',
    'bpmn:SequenceFlow':      'bg-zinc-400',
    'bpmn:SubProcess':        'bg-cyan-500',
  };

  const headerColor = typeColor[type] ?? 'bg-zinc-400';

  return (
    <div className="flex flex-col h-full">
      {/* Inspector header */}
      <div className={cn('flex items-center gap-3 px-4 py-3 shrink-0', headerColor)}>
        <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center">
          <Settings className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-semibold truncate">{name || '(sem nome)'}</p>
          <p className="text-white/70 text-[10px]">{typeLabel[type] ?? type}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="props" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="w-full rounded-none border-b border-zinc-100 dark:border-zinc-800 bg-transparent h-9 px-1 shrink-0">
          <TabsTrigger value="props"  className="flex-1 text-xs h-7">Propriedades</TabsTrigger>
          {isServiceTask && <TabsTrigger value="rpa" className="flex-1 text-xs h-7">Config RPA</TabsTrigger>}
          <TabsTrigger value="info"   className="flex-1 text-xs h-7">Info</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          {/* Properties tab */}
          <TabsContent value="props" className="p-4 space-y-4 mt-0">
            <Field label="Nome">
              <Input
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                className="h-8 text-xs"
                placeholder="Nome do elemento..."
              />
            </Field>

            {(isUserTask || isServiceTask) && (
              <Field label="Descrição / Documentação">
                <Textarea
                  value={doc}
                  onChange={(e) => onDocChange(e.target.value)}
                  className="text-xs min-h-[70px]"
                  placeholder="Descreva o propósito deste elemento..."
                />
              </Field>
            )}

            {isFlow && (
              <Field
                label="Expressão de Condição"
                hint="Usada em fluxos que saem de um Gateway Exclusivo (XOR)."
              >
                <Input
                  value={conditionExpr}
                  onChange={(e) => onConditionChange(e.target.value)}
                  className="h-8 text-xs font-mono"
                  placeholder="${variavel == 'valor'}"
                />
              </Field>
            )}
          </TabsContent>

          {/* RPA config tab — only for ServiceTask */}
          {isServiceTask && (
            <TabsContent value="rpa" className="p-4 space-y-4 mt-0">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-fuchsia-50 dark:bg-fuchsia-950/30 border border-fuchsia-200 dark:border-fuchsia-900">
                <Bot className="w-4 h-4 text-fuchsia-600 mt-0.5 shrink-0" />
                <p className="text-xs text-fuchsia-700 dark:text-fuchsia-300 leading-relaxed">
                  Este Service Task será executado por um Worker RPA. Configure a fila e o payload abaixo.
                </p>
              </div>

              <Field label="Fila RPA (rpa_queue)" hint="Identifica qual robô do Worker deve executar esta tarefa.">
                <Select
                  value={rpaConfig.queue || ''}
                  onValueChange={(v) => onRpaChange({ queue: v === 'custom' ? '' : v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecionar fila..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RPA_QUEUES.map((q) => (
                      <SelectItem key={q.value} value={q.value} className="text-xs">
                        {q.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(rpaConfig.queue === '' || rpaConfig.queue === 'custom') && (
                  <Input
                    className="h-8 text-xs font-mono mt-1.5"
                    placeholder="nome_da_fila_personalizada"
                    onChange={(e) => onRpaChange({ queue: e.target.value })}
                  />
                )}
              </Field>

              <Field
                label="Payload (rpa_payload)"
                hint="JSON com os parâmetros injetados no robô. Use {{variavel}} para dados dinâmicos do processo."
              >
                <Textarea
                  value={rpaConfig.payload}
                  onChange={(e) => onRpaChange({ payload: e.target.value })}
                  className="text-xs font-mono min-h-[120px]"
                  placeholder={'{\n  "processo_id": "{{id}}",\n  "valor": "{{valor_causa}}"\n}'}
                />
              </Field>

              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 space-y-1">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Como funciona</p>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  1. O motor BPMN cria uma task com <code className="font-mono">task_type=RPA</code> e <code className="font-mono">rpa_queue</code> definida.<br />
                  2. O Worker faz polling e executa o robô correspondente.<br />
                  3. O resultado é salvo em <code className="font-mono">rpa_result</code> e a instância avança.
                </p>
              </div>
            </TabsContent>
          )}

          {/* Info tab */}
          <TabsContent value="info" className="p-4 space-y-2 mt-0">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Metadados do elemento</p>
              <div className="space-y-1 font-mono">
                <p className="text-[10px] text-zinc-500">ID: <span className="text-zinc-700 dark:text-zinc-300">{element.id}</span></p>
                <p className="text-[10px] text-zinc-500">Tipo: <span className="text-zinc-700 dark:text-zinc-300">{type}</span></p>
              </div>
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function BpmnModelerPage() {
  const containerRef  = useRef<HTMLDivElement>(null);
  const modelerRef    = useRef<BpmnModeler | null>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const { tenant }    = useTenant();
  const queryClient   = useQueryClient();

  const [templateName,     setTemplateName]     = useState('Novo Processo');
  const [editingId,        setEditingId]        = useState<string | null>(null);
  const [isSaving,         setIsSaving]         = useState(false);
  const [isDirty,          setIsDirty]          = useState(false);
  const [selectedElement,  setSelectedElement]  = useState<SelectedElement | null>(null);

  // RPA configs keyed by element ID — persisted in form_schema
  const [rpaConfigs, setRpaConfigs] = useState<Record<string, RpaConfig>>({});

  // ── Saved templates ────────────────────────────────────────────────────────
  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ['bpmn-templates-modeler', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('templates').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as BPMNTemplate[];
    },
    enabled: !!tenant,
  });

  // ── Init modeler ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const modeler = new BpmnModeler({
      container: containerRef.current,
      keyboard: { bindTo: window },
    });

    modelerRef.current = modeler;
    modeler.importXML(BLANK_DIAGRAM).catch(console.error);
    modeler.on('commandStack.changed', () => setIsDirty(true));

    // Element selection → inspector
    modeler.on('selection.changed', ({ newSelection }: any) => {
      if (newSelection.length === 1) {
        const el = newSelection[0];
        setSelectedElement({
          id:             el.id,
          type:           el.businessObject.$type,
          businessObject: el.businessObject,
        });
      } else {
        setSelectedElement(null);
      }
    });

    // Keep selectedElement in sync with businessObject changes (e.g. inline name edit)
    modeler.on('element.changed', ({ element }: any) => {
      setSelectedElement((prev) =>
        prev?.id === element.id
          ? { id: element.id, type: element.businessObject.$type, businessObject: element.businessObject }
          : prev,
      );
    });

    return () => modeler.destroy();
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fitToScreen = () => {
    (modelerRef.current as any)?.get('canvas')?.zoom('fit-viewport', 'auto');
  };

  const loadDiagram = useCallback(async (xml: string, formSchema?: Record<string, unknown>) => {
    if (!modelerRef.current) return;
    await modelerRef.current.importXML(xml);
    setSelectedElement(null);
    setRpaConfigs((formSchema?.elementRpaConfig as Record<string, RpaConfig>) ?? {});
    fitToScreen();
    setIsDirty(false);
  }, []);

  // ── Palette: drag element to canvas ───────────────────────────────────────
  const handlePaletteMouseDown = useCallback((e: React.MouseEvent, bpmnType: string) => {
    if (!modelerRef.current) return;
    const elementFactory = (modelerRef.current as any).get('elementFactory');
    const create         = (modelerRef.current as any).get('create');
    const shape          = elementFactory.createShape({ type: bpmnType });
    create.start(e.nativeEvent, shape);
  }, []);

  // ── Inspector: update element properties ──────────────────────────────────
  const getModeling  = () => (modelerRef.current as any)?.get('modeling');
  const getRawElement = (id: string) =>
    (modelerRef.current as any)?.get('elementRegistry')?.get(id);

  const handleNameChange = (name: string) => {
    if (!selectedElement) return;
    const el = getRawElement(selectedElement.id);
    if (el) getModeling()?.updateProperties(el, { name });
  };

  const handleDocChange = (text: string) => {
    if (!selectedElement) return;
    const el = getRawElement(selectedElement.id);
    if (!el) return;
    const bpmnFactory = (modelerRef.current as any).get('bpmnFactory');
    const doc = bpmnFactory.create('bpmn:Documentation', { text });
    getModeling()?.updateProperties(el, { documentation: [doc] });
  };

  const handleConditionChange = (body: string) => {
    if (!selectedElement) return;
    const el = getRawElement(selectedElement.id);
    if (!el) return;
    const bpmnFactory = (modelerRef.current as any).get('bpmnFactory');
    const expr = bpmnFactory.create('bpmn:FormalExpression', { body });
    getModeling()?.updateProperties(el, { conditionExpression: expr });
    setIsDirty(true);
  };

  const handleRpaChange = (patch: Partial<RpaConfig>) => {
    if (!selectedElement) return;
    setRpaConfigs((prev) => ({
      ...prev,
      [selectedElement.id]: { ...{ queue: '', payload: '' }, ...prev[selectedElement.id], ...patch },
    }));
    setIsDirty(true);
  };

  // ── Load template ──────────────────────────────────────────────────────────
  const handleLoadTemplate = (tpl: BPMNTemplate) => {
    setTemplateName(tpl.name);
    setEditingId(tpl.id);
    loadDiagram(tpl.bpmn_xml, tpl.form_schema as Record<string, unknown> ?? {});
  };

  const handleNewDiagram = () => {
    setTemplateName('Novo Processo');
    setEditingId(null);
    loadDiagram(BLANK_DIAGRAM);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!modelerRef.current || !tenant) return;
    setIsSaving(true);
    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      if (!xml) throw new Error('Erro ao gerar XML');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const form_schema = { elementRpaConfig: rpaConfigs } as any;

      if (editingId) {
        const current = templates.find((t) => t.id === editingId);
        const { error } = await supabase
          .from('templates')
          .update({ name: templateName, bpmn_xml: xml, form_schema, version: (current?.version ?? 1) + 1 })
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Template atualizado!');
      } else {
        const { data, error } = await supabase
          .from('templates')
          .insert({ tenant_id: tenant.id, name: templateName, bpmn_xml: xml, form_schema, is_active: true })
          .select().single();
        if (error) throw error;
        setEditingId(data.id);
        toast.success('Template salvo!');
      }

      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['bpmn-templates-modeler'] });
      queryClient.invalidateQueries({ queryKey: ['bpmn-templates'] });
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from('templates').delete().eq('id', id);
    if (error) { toast.error('Erro ao deletar'); return; }
    toast.success('Template removido.');
    if (editingId === id) handleNewDiagram();
    queryClient.invalidateQueries({ queryKey: ['bpmn-templates-modeler'] });
    queryClient.invalidateQueries({ queryKey: ['bpmn-templates'] });
  };

  const exportXML = async () => {
    if (!modelerRef.current) return;
    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      if (!xml) return;
      const blob = new Blob([xml], { type: 'text/xml' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `${templateName}.bpmn`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Erro ao exportar XML'); }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const xml = ev.target?.result as string;
      setTemplateName(file.name.replace(/\.bpmn$/, ''));
      setEditingId(null);
      loadDiagram(xml);
      toast.success(`"${file.name}" importado. Salve para criar o template.`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ─── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">

      {/* ── LEFT SIDEBAR ───────────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
        <Tabs defaultValue="elements" className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="w-full rounded-none border-b border-zinc-100 dark:border-zinc-800 bg-transparent h-9 px-1 shrink-0">
            <TabsTrigger value="elements"  className="flex-1 text-xs h-7">Elementos</TabsTrigger>
            <TabsTrigger value="templates" className="flex-1 text-xs h-7">Templates</TabsTrigger>
          </TabsList>

          {/* Palette tab */}
          <TabsContent value="elements" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-4">
                {BPMN_PALETTE.map((group) => (
                  <div key={group.category}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 px-2 mb-1">
                      {group.category}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map((item: typeof group.items[number]) => (
                        <PaletteItem
                          key={item.bpmnType}
                          label={item.label}
                          icon={item.icon}
                          color={item.color}
                          onMouseDown={(e) => handlePaletteMouseDown(e, item.bpmnType)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="px-3 py-3 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    Clique e arraste um elemento para o canvas para adicioná-lo ao diagrama.
                  </p>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Templates tab */}
          <TabsContent value="templates" className="flex-1 overflow-hidden mt-0">
            <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
              <Button size="sm" variant="outline" className="w-full gap-2 h-8 text-xs" onClick={handleNewDiagram}>
                <Plus className="w-3.5 h-3.5" /> Novo Diagrama
              </Button>
            </div>
            <ScrollArea className="h-[calc(100%-48px)]">
              <div className="p-2 space-y-0.5">
                {loadingTemplates && (
                  <div className="flex items-center gap-2 px-2 py-4 text-xs text-zinc-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> Carregando...
                  </div>
                )}
                {!loadingTemplates && templates.length === 0 && (
                  <p className="text-xs text-zinc-400 text-center py-8">Nenhum template salvo.</p>
                )}
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => handleLoadTemplate(tpl)}
                    className={cn(
                      'group flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800',
                      editingId === tpl.id && 'bg-primary/8 text-primary',
                    )}
                  >
                    <Workflow className="w-4 h-4 shrink-0 opacity-50" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{tpl.name}</p>
                      <p className="text-[10px] text-zinc-400">
                        v{tpl.version} · {format(new Date(tpl.created_at), 'dd/MM/yy', { locale: ptBR })}
                      </p>
                    </div>
                    {editingId === tpl.id && <ChevronRight className="w-3 h-3 shrink-0" />}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Deletar "{tpl.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Processos em andamento não serão afetados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => handleDeleteTemplate(tpl.id)}>
                            Deletar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </aside>

      {/* ── CENTER: Toolbar + Canvas ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
          <FilePen className="w-4 h-4 text-zinc-400 shrink-0" />
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="h-7 w-52 text-sm font-semibold border-0 shadow-none focus-visible:ring-1"
            placeholder="Nome do processo..."
          />
          <div className="flex items-center gap-1.5">
            {editingId && <Badge variant="outline" className="text-[10px] h-5">Editando</Badge>}
            {isDirty    && <Badge variant="secondary" className="text-[10px] h-5">Não salvo</Badge>}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fitToScreen}>
                  <Maximize2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ajustar ao ecrã</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Importar .bpmn</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={exportXML}>
                  <FileDown className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Exportar .bpmn</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <Button size="sm" className="h-7 gap-1.5" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {editingId ? 'Atualizar' : 'Salvar'}
            </Button>
          </div>
        </div>

        {/* BPMN canvas */}
        <div className="flex-1 relative overflow-hidden">
          <div ref={containerRef} className="absolute inset-0" style={{ backgroundColor: '#ffffff' }} />
        </div>
      </div>

      {/* ── RIGHT INSPECTOR ─────────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
        {selectedElement ? (
          <ElementInspector
            element={selectedElement}
            rpaConfig={rpaConfigs[selectedElement.id] ?? { queue: '', payload: '' }}
            onNameChange={handleNameChange}
            onDocChange={handleDocChange}
            onConditionChange={handleConditionChange}
            onRpaChange={handleRpaChange}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <Info className="w-5 h-5 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Nenhum elemento selecionado</p>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Clique em qualquer elemento do diagrama para editar suas propriedades aqui.
              </p>
            </div>
            <div className="mt-2 p-3 rounded-lg bg-fuchsia-50 dark:bg-fuchsia-950/30 border border-fuchsia-100 dark:border-fuchsia-900 text-left w-full">
              <p className="text-[10px] font-semibold text-fuchsia-600 mb-1 flex items-center gap-1">
                <Bot className="w-3 h-3" /> Service Tasks com RPA
              </p>
              <p className="text-[10px] text-fuchsia-600/80 leading-relaxed">
                Clique em um <strong>Service Task</strong> para configurar a fila RPA e o payload do robô.
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".bpmn,.xml" className="hidden" onChange={handleImportFile} />

      <style>{`
        .bjs-container  { background-color: #ffffff !important; }
        .djs-label      { fill: #22242a !important; }
        .bjs-powered-by { display: none; }
        .djs-palette    { display: none !important; }
      `}</style>
    </div>
  );
}
