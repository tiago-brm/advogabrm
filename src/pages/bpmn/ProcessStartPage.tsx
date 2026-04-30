import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Form } from '@bpmn-io/form-js';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ChevronLeft, Play } from 'lucide-react';
import '@bpmn-io/form-js/dist/assets/form-js.css';

export default function ProcessStartPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const formContainerRef = useRef<HTMLDivElement>(null);
  const formInstanceRef = useRef<Form | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: template, isLoading } = useQuery({
    queryKey: ['bpmn-template', templateId],
    queryFn: async () => {
      const { data, error } = await supabase.from('templates').select('*').eq('id', templateId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  useEffect(() => {
    if (!formContainerRef.current || !template?.form_schema) return;
    
    // Clear previous if any
    formContainerRef.current.innerHTML = '';

    const form = new Form({
      container: formContainerRef.current
    });

    form.importSchema(template.form_schema).catch((err: any) => {
      console.error("Erro ao carregar schema do formulário", err);
    });

    formInstanceRef.current = form;

    return () => {
      form.destroy();
    };
  }, [template]);

  const handleSubmit = async () => {
    if (!formInstanceRef.current || !tenant || !template) return;
    setIsSubmitting(true);

    try {
      const { data, errors } = formInstanceRef.current.submit();
      
      if (Object.keys(errors).length > 0) {
        toast.error("Por favor, corrija os erros no formulário antes de prosseguir.");
        setIsSubmitting(false);
        return;
      }

      // Mock behavior: Create process instance
      const { data: instance, error: instanceError } = await supabase
        .from('process_instances')
        .insert({
          template_id: template.id,
          tenant_id: tenant.id,
          status: 'ACTIVE',
        })
        .select()
        .single();

      if (instanceError) throw instanceError;

      // Mock behavior: Create the first User Task automatically to simulate workflow
      const { error: taskError } = await supabase
        .from('tasks')
        .insert({
          process_instance_id: instance.id,
          tenant_id: tenant.id,
          name: `Revisão Inicial - ${template.name}`,
          status: 'PENDING',
          // Reusing the schema or a mock one for the next step
          form_schema: template.form_schema 
        });

      if (taskError) throw taskError;

      toast.success("Processo iniciado com sucesso!");
      navigate('/bpmn/tarefas');
    } catch (error: any) {
      toast.error(`Erro ao iniciar processo: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="p-8">Carregando...</div>;

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <Button variant="ghost" onClick={() => navigate('/bpmn/catalogo')} className="mb-4">
        <ChevronLeft className="w-4 h-4 mr-2" /> Voltar ao Catálogo
      </Button>

      <div className="bg-card border rounded-lg shadow-sm p-6">
        <h1 className="text-2xl font-bold mb-2">{template?.name}</h1>
        <p className="text-muted-foreground mb-6">Preencha os dados iniciais para dar andamento ao processo.</p>

        {template?.form_schema ? (
          <div className="bpmn-form-wrapper bg-white dark:bg-zinc-950 p-4 rounded border mb-6 text-foreground">
            <div ref={formContainerRef} />
          </div>
        ) : (
          <div className="p-4 border rounded bg-muted/20 mb-6 text-center text-muted-foreground">
            Este processo não exige formulário inicial.
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            <Play className="w-4 h-4 mr-2" /> Iniciar Processo
          </Button>
        </div>
      </div>
    </div>
  );
}
