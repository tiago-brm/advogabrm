import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { RpaTask } from '@/types/bpmn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Bot,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Eye,
  RotateCcw,
  Activity,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

type StatusFilter = 'ALL' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

const STATUS_CONFIG = {
  PENDING: {
    label: 'Aguardando',
    icon: Clock,
    badge: 'secondary' as const,
    color: 'text-yellow-600',
  },
  IN_PROGRESS: {
    label: 'Executando',
    icon: Loader2,
    badge: 'default' as const,
    color: 'text-blue-600',
  },
  COMPLETED: {
    label: 'Concluída',
    icon: CheckCircle2,
    badge: 'default' as const,
    color: 'text-green-600',
  },
  FAILED: {
    label: 'Falhou',
    icon: XCircle,
    badge: 'destructive' as const,
    color: 'text-red-600',
  },
};

function JsonViewer({ data, title }: { data: unknown; title: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Eye className="w-3 h-3" />
          Ver
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <pre className="bg-muted rounded-md p-4 text-xs overflow-auto max-h-96 font-mono">
          {JSON.stringify(data, null, 2)}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: RpaTask['status'] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.badge} className="gap-1">
      <Icon className={`w-3 h-3 ${status === 'IN_PROGRESS' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </Badge>
  );
}

function TaskRow({ task, onRetry }: { task: RpaTask; onRetry: (id: string) => void }) {
  return (
    <Card className="hover:bg-muted/5 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={task.status} />
              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                {task.rpa_queue ?? '—'}
              </span>
              <span className="text-xs text-muted-foreground">
                {task.name}
              </span>
            </div>

            {task.error_message && (
              <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded p-2 font-mono">
                {task.error_message}
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Criada{' '}
              {formatDistanceToNow(new Date(task.created_at), {
                locale: ptBR,
                addSuffix: true,
              })}
              {task.completed_at && (
                <> · Concluída {format(new Date(task.completed_at), "dd/MM HH:mm", { locale: ptBR })}</>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {task.rpa_payload && (
              <JsonViewer data={task.rpa_payload} title="Payload enviado ao robô" />
            )}
            {task.rpa_result && (
              <JsonViewer data={task.rpa_result} title="Resultado do robô" />
            )}
            {task.status === 'FAILED' && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-orange-600 border-orange-300 hover:bg-orange-50"
                onClick={() => onRetry(task.id)}
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`w-8 h-8 ${className}`} />
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RpaQueueMonitorPage() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<StatusFilter>('ALL');

  const { data: tasks = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['rpa-tasks', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, process_instance:process_instances(template:templates(name))')
        .eq('task_type', 'RPA')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as RpaTask[];
    },
    enabled: !!tenant,
    refetchInterval: 5_000,
  });

  const retryMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'PENDING', error_message: null })
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rpa-tasks'] });
      toast({ title: 'Task enviada para retry', description: 'O Worker irá processá-la nos próximos segundos.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao fazer retry', description: err.message, variant: 'destructive' });
    },
  });

  const counts = {
    ALL: tasks.length,
    PENDING: tasks.filter((t) => t.status === 'PENDING').length,
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    COMPLETED: tasks.filter((t) => t.status === 'COMPLETED').length,
    FAILED: tasks.filter((t) => t.status === 'FAILED').length,
  };

  const filtered = activeTab === 'ALL' ? tasks : tasks.filter((t) => t.status === activeTab);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Monitor RPA</h1>
            <p className="text-muted-foreground">
              Fila de tarefas automatizadas em tempo real.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="w-3 h-3 text-green-500 animate-pulse" />
          Atualiza a cada 5s ·{' '}
          {dataUpdatedAt
            ? format(new Date(dataUpdatedAt), 'HH:mm:ss')
            : '—'}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Aguardando" value={counts.PENDING} icon={Clock} className="text-yellow-500" />
        <StatCard label="Executando" value={counts.IN_PROGRESS} icon={Loader2} className="text-blue-500" />
        <StatCard label="Concluídas" value={counts.COMPLETED} icon={CheckCircle2} className="text-green-500" />
        <StatCard label="Falhas" value={counts.FAILED} icon={XCircle} className="text-red-500" />
      </div>

      {/* Tasks */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="ALL">Todas ({counts.ALL})</TabsTrigger>
          <TabsTrigger value="PENDING">Aguardando ({counts.PENDING})</TabsTrigger>
          <TabsTrigger value="IN_PROGRESS">Executando ({counts.IN_PROGRESS})</TabsTrigger>
          <TabsTrigger value="COMPLETED">Concluídas ({counts.COMPLETED})</TabsTrigger>
          <TabsTrigger value="FAILED">Falhas ({counts.FAILED})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 space-y-3">
          {isLoading ? (
            <div className="text-center p-12 text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center p-12 border rounded-lg bg-muted/20">
              <RefreshCw className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhuma task neste filtro.</p>
            </div>
          ) : (
            filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onRetry={(id) => retryMutation.mutate(id)}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
