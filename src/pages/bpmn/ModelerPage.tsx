import React, { useEffect, useRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import { Button } from '@/components/ui/button';
import { Save, FileDown, Upload, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from 'sonner';

export default function BpmnModelerPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const { tenant } = useTenant();
  const [templateName, setTemplateName] = useState('Novo Processo');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const modeler = new BpmnModeler({
      container: containerRef.current,
      keyboard: {
        bindTo: window
      }
    });

    modelerRef.current = modeler;

    const newDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="156" y="81" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

    modeler.importXML(newDiagram).catch(err => console.error("Error rendering BPMN", err));

    return () => {
      modeler.destroy();
    };
  }, []);

  const handleSave = async () => {
    if (!modelerRef.current || !tenant) return;
    setIsSaving(true);
    
    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      if (!xml) throw new Error("Erro ao gerar XML");

      const { error } = await supabase.from('templates').insert({
        tenant_id: tenant.id,
        name: templateName,
        bpmn_xml: xml,
        form_schema: {}, // Placeholder for form schema integration later
        is_active: true
      });

      if (error) throw error;
      toast.success("Template salvo com sucesso!");
    } catch (error: any) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const exportXML = async () => {
    if (!modelerRef.current) return;
    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      if (!xml) return;
      const blob = new Blob([xml], { type: 'text/xml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${templateName}.bpmn`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Erro ao exportar XML");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] w-full relative bg-white dark:bg-zinc-950 border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b bg-muted/20">
        <div className="flex items-center gap-4">
          <input 
            type="text" 
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="text-lg font-semibold bg-transparent border-none outline-none focus:ring-2 ring-primary/20 rounded px-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportXML}>
            <FileDown className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={handleSave} size="sm" disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Template
          </Button>
        </div>
      </div>
      <div className="flex-1 relative" id="bpmn-container">
        <div ref={containerRef} className="absolute inset-0 bpmn-canvas" style={{ backgroundColor: '#ffffff' }} />
      </div>
      {/* Global override to ensure text is visible in dark mode within the canvas */}
      <style>{`
        .bjs-container { background-color: #ffffff !important; }
        .djs-label { fill: #22242a !important; }
      `}</style>
    </div>
  );
}
