export type BPMNTemplate = {
  id: string;
  tenant_id: string | null;
  name: string;
  bpmn_xml: string;
  form_schema: any | null;
  version: number;
  is_active: boolean;
  created_at: string;
};

export type ProcessInstance = {
  id: string;
  template_id: string;
  tenant_id: string;
  external_id: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'SUSPENDED' | 'TERMINATED';
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  template?: BPMNTemplate; // related data
};

export type Task = {
  id: string;
  process_instance_id: string;
  tenant_id: string;
  external_task_id: string | null;
  name: string;
  assignee_id: string | null;
  form_schema: any | null;
  status: 'PENDING' | 'COMPLETED';
  created_at: string;
  completed_at: string | null;
  process_instance?: ProcessInstance; // related data
};
