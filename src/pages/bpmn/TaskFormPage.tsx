import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Form } from '@bpmn-io/form-js';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ChevronLeft, CheckCircle } from 'lucide-react';
import '@bpmn-io/form-js/dist/assets/form-js.css';

export default function TaskFormPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const formContainerRef = useRef<HTMLDivElement>(null);
  const formInstanceRef = useRef<Form | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: task, isLoading } = useQuery({
    queryKey: ['bpmn-task', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, process_instance:process_instances(template:templates(name))')
        .eq('id', taskId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!taskId,
  });

  useEffect(() => {
    if (!formContainerRef.current || !task?.form_schema) return;
    
    formContainerRef.current.innerHTML = '';

    const form = new Form({
      container: formContainerRef.current
    });

    form.importSchema(task.form_schema).catch((err: any) => {
      console.error("Erro ao carregar schema do formulário", err);
    });

    formInstanceRef.current = form;

    return () => {
      form.destroy();
    };
  }, [task]);

  const handleComplete = async () => {
    if (!task) return;
    setIsSubmitting(true);

    try {
      if (formInstanceRef.current && task.form_schema) {
        const { errors, data } = formInstanceRef.current.submit();
        if (Object.keys(errors).length > 0) {
          toast.error("Preencha todos os campos obrigatórios corretamente.");
          setIsSubmitting(false);
          return;
        }
        // In a real scenario, we would save 'data' into process variables
      }

      const { error } = await supabase
        .from('tasks')
        .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
        .eq('id', task.id);

      if (error) throw error;

      toast.success("Tarefa concluída!");
      navigate('/bpmn/tarefas');
    } catch (error: any) {
      toast.error(`Erro ao concluir tarefa: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="p-8">Carregando tarefa...</div>;

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <Button variant="ghost" onClick={() => navigate('/bpmn/tarefas')} className="mb-4">
        <ChevronLeft className="w-4 h-4 mr-2" /> Voltar
      </Button>

      <div className="bg-card border rounded-lg shadow-sm p-6">
        <div className="mb-6">
          <div className="text-sm font-semibold text-primary mb-1 uppercase tracking-wide">
            {/* @ts-ignore */}
            {task?.process_instance?.template?.name || 'Processo'}
          </div>
          <h1 className="text-2xl font-bold">{task?.name}</h1>
        </div>

        {task?.form_schema ? (
          <div className="bpmn-form-wrapper bg-white dark:bg-zinc-950 p-4 rounded border mb-6 text-foreground">
            <div ref={formContainerRef} />
          </div>
        ) : (
          <div className="p-4 border rounded bg-muted/20 mb-6 text-center text-muted-foreground">
            Esta tarefa apenas requer sua confirmação de ciência.
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleComplete} disabled={isSubmitting}>
            <CheckCircle className="w-4 h-4 mr-2" /> Concluir Tarefa
          </Button>
        </div>
      </div>
    </div>
  );
}
