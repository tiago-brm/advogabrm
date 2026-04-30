import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Task } from '@/types/bpmn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ListTodo, CheckCircle2, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function TasksInboxPage() {
  const { tenant } = useTenant();
  const navigate = useNavigate();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['bpmn-tasks', tenant?.id],
    queryFn: async () => {
      // In a real app we would join with process_instances and templates to get names.
      // For now we just fetch the tasks.
      const { data, error } = await supabase
        .from('tasks')
        .select('*, process_instance:process_instances(template:templates(name))')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      return data;
    },
    enabled: !!tenant,
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando tarefas...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <ListTodo className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minhas Tarefas</h1>
          <p className="text-muted-foreground">Tarefas pendentes de ação manual nos fluxos de Legal Ops.</p>
        </div>
      </div>

      {tasks?.length === 0 ? (
        <div className="text-center p-12 border rounded-lg bg-muted/20">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium">Caixa de Entrada Vazia</h3>
          <p className="text-muted-foreground">Você não tem tarefas pendentes no momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {tasks?.map((task) => (
            <Card key={task.id} className="hover:bg-muted/10 transition-colors">
              <CardContent className="p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-semibold text-lg">{task.name}</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Criada em {format(new Date(task.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                  </div>
                  {/* @ts-ignore - Supabase nested select types are tricky */}
                  <div className="text-xs font-mono bg-muted p-1 rounded inline-block mt-2">
                    Processo: {task.process_instance?.template?.name || "Desconhecido"}
                  </div>
                </div>
                <div>
                  <Button onClick={() => navigate(`/bpmn/tarefas/${task.id}`)}>
                    Executar Tarefa
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
