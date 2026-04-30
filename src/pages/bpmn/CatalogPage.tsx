import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Workflow, Play } from 'lucide-react';
import { BPMNTemplate } from '@/types/bpmn';
import { useNavigate } from 'react-router-dom';

export default function CatalogPage() {
  const { tenant, role } = useTenant();
  const navigate = useNavigate();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['bpmn-templates', tenant?.id],
    queryFn: async () => {
      // Fetch both tenant-specific and global (tenant_id IS NULL) templates
      let query = supabase.from('templates').select('*').eq('is_active', true);
      
      // If we are not SUPER_ADMIN and we have a tenant, the RLS already filters it.
      // But we can be explicit or just let RLS do its job.
      
      const { data, error } = await query;
      if (error) throw error;
      return data as BPMNTemplate[];
    },
    enabled: !!tenant || role === 'SUPER_ADMIN',
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando catálogo...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Catálogo de Serviços</h1>
        <p className="text-muted-foreground mt-2">Selecione um processo padronizado para iniciar.</p>
      </div>

      {templates?.length === 0 ? (
        <div className="text-center p-12 border rounded-lg bg-muted/20">
          <Workflow className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">Nenhum processo disponível</h3>
          <p className="text-muted-foreground">O Super Admin ainda não disponibilizou nenhum template BPMN para este escritório.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates?.map((tpl) => (
            <Card key={tpl.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Workflow className="w-5 h-5 text-primary" />
                  {tpl.name}
                </CardTitle>
                <CardDescription>Versão {tpl.version}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground">
                  {tpl.tenant_id ? "Processo Exclusivo do Escritório" : "Processo Global Padrão"}
                </p>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  onClick={() => navigate(`/bpmn/processos/novo/${tpl.id}`)}
                >
                  <Play className="w-4 h-4 mr-2" /> Iniciar Processo
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
