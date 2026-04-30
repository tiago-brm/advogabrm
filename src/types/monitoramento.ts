export interface MonitoramentoProcesso {
  id: string;
  tenant_id: string;
  user_id: string;
  numero: string;
  tribunal: string | null;
  dados_datajud: any;
  dados_rpa: any;
  assunto: string | null;
  classe: string | null;
  situacao: string | null;
  valor_causa: number | null;
  vara: string | null;
  juiz: string | null;
  partes: Array<{ nome: string; tipo: string }>;
  ultima_consulta: string;
  convertido_em: string | null;
  created_at: string;
}
