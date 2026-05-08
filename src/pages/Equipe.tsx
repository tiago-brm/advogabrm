import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { PermissionGate } from '@/components/PermissionGate';
import { ROLE_LABELS, assignableRoles, type AppRole } from '@/lib/permissions';
import {
  UserPlus, Edit, Trash2, Mail, Phone, Briefcase, UserCheck,
  Search, Loader2, ShieldCheck, MapPin, FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Types ──────────────────────────────────────────────────

interface MembroEquipe {
  id: string;
  user_id: string;
  tenant_id?: string;
  profile_id?: string | null;
  nome: string;
  email: string;
  telefone?: string;
  whatsapp?: string;
  cargo: string;
  departamento: string;
  nivel_acesso?: string;
  pode_assinar?: boolean;
  data_admissao?: string;
  salario?: number;
  tipo_contrato?: string;
  status: 'Ativo' | 'Inativo' | 'Férias';
  cpf?: string;
  oab?: string;
  oab_uf?: string;
  data_nascimento?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  endereco?: string;
  observacoes?: string;
  foto_url?: string;
  created_at: string;
  updated_at: string;
}

// ─── Constantes ──────────────────────────────────────────────

const CARGOS = [
  'Advogado Sênior', 'Advogado Pleno', 'Advogado Júnior',
  'Estagiário', 'Paralegal', 'Secretário Jurídico',
  'Assistente Administrativo', 'Gerente', 'Coordenador', 'Analista',
];

const DEPARTAMENTOS = [
  'Jurídico', 'Administrativo', 'Financeiro',
  'Recursos Humanos', 'Tecnologia', 'Atendimento',
];

const CONTRATOS = ['CLT', 'PJ', 'Estágio', 'Freelancer'] as const;

const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

// ─── Schema ──────────────────────────────────────────────────

const schema = z.object({
  nome:             z.string().min(3, 'Mínimo 3 caracteres'),
  email:            z.string().email('E-mail inválido'),
  telefone:         z.string().optional(),
  whatsapp:         z.string().optional(),
  cargo:            z.string().min(1, 'Selecione o cargo'),
  departamento:     z.string().min(1, 'Selecione o departamento'),
  nivel_acesso:     z.string().optional(),
  pode_assinar:     z.boolean().optional(),
  data_admissao:    z.string().optional(),
  salario:          z.string().optional(),
  tipo_contrato:    z.string().optional(),
  status:           z.enum(['Ativo', 'Inativo', 'Férias']),
  cpf:              z.string().optional(),
  oab:              z.string().optional(),
  oab_uf:           z.string().optional(),
  data_nascimento:  z.string().optional(),
  cep:              z.string().optional(),
  logradouro:       z.string().optional(),
  numero:           z.string().optional(),
  complemento:      z.string().optional(),
  bairro:           z.string().optional(),
  cidade:           z.string().optional(),
  estado:           z.string().optional(),
  observacoes:      z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// ─── ViaCEP ──────────────────────────────────────────────────

async function buscarViaCep(cep: string) {
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = await res.json();
    if (data.erro) return null;
    return data as { logradouro: string; bairro: string; localidade: string; uf: string };
  } catch { return null; }
}

// ─── Componente ──────────────────────────────────────────────

export default function Equipe() {
  const { user } = useAuth();
  const { role, can, isMaster } = usePermissions();

  const [membros, setMembros]           = useState<MembroEquipe[]>([]);
  const [loading, setLoading]           = useState(true);
  const [searchTerm, setSearchTerm]     = useState('');
  const [isFormOpen, setIsFormOpen]     = useState(false);
  const [editingMembro, setEditingMembro] = useState<MembroEquipe | null>(null);
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [viewingMembro, setViewingMembro] = useState<MembroEquipe | null>(null);
  const [cepLoading, setCepLoading]     = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'Ativo', pode_assinar: false },
  });

  // ── Fetch ────────────────────────────────────────────────

  const loadMembros = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('equipe')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
    setMembros(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (user) loadMembros(); }, [user]);

  // ── CEP ──────────────────────────────────────────────────

  const handleCepBlur = async () => {
    const cep = form.getValues('cep') ?? '';
    if (cep.replace(/\D/g, '').length !== 8) return;
    setCepLoading(true);
    const data = await buscarViaCep(cep);
    setCepLoading(false);
    if (!data) { toast({ title: 'CEP não encontrado', variant: 'destructive' }); return; }
    form.setValue('logradouro', data.logradouro);
    form.setValue('bairro', data.bairro);
    form.setValue('cidade', data.localidade);
    form.setValue('estado', data.uf);
  };

  // ── Form open ────────────────────────────────────────────

  const handleOpenForm = (membro?: MembroEquipe) => {
    if (membro) {
      setEditingMembro(membro);
      form.reset({
        nome:            membro.nome,
        email:           membro.email,
        telefone:        membro.telefone ?? '',
        whatsapp:        membro.whatsapp ?? '',
        cargo:           membro.cargo,
        departamento:    membro.departamento,
        nivel_acesso:    membro.nivel_acesso ?? 'READONLY',
        pode_assinar:    membro.pode_assinar ?? false,
        data_admissao:   membro.data_admissao ?? '',
        salario:         membro.salario?.toString() ?? '',
        tipo_contrato:   membro.tipo_contrato ?? '',
        status:          membro.status,
        cpf:             membro.cpf ?? '',
        oab:             membro.oab ?? '',
        oab_uf:          membro.oab_uf ?? '',
        data_nascimento: membro.data_nascimento ?? '',
        cep:             membro.cep ?? '',
        logradouro:      membro.logradouro ?? '',
        numero:          membro.numero ?? '',
        complemento:     membro.complemento ?? '',
        bairro:          membro.bairro ?? '',
        cidade:          membro.cidade ?? '',
        estado:          membro.estado ?? '',
        observacoes:     membro.observacoes ?? '',
      });
    } else {
      setEditingMembro(null);
      form.reset({ status: 'Ativo', pode_assinar: false, nivel_acesso: 'READONLY' });
    }
    setIsFormOpen(true);
  };

  // ── Submit ───────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    const enderecoLegivel = [
      values.logradouro,
      values.numero && `nº ${values.numero}`,
      values.complemento,
      values.bairro,
      values.cidade && values.estado ? `${values.cidade}/${values.estado}` : values.cidade,
    ].filter(Boolean).join(', ');

    const payload: any = {
      nome:            values.nome,
      email:           values.email,
      telefone:        values.telefone || null,
      whatsapp:        values.whatsapp || null,
      cargo:           values.cargo,
      departamento:    values.departamento,
      nivel_acesso:    values.nivel_acesso || 'READONLY',
      pode_assinar:    values.pode_assinar ?? false,
      data_admissao:   values.data_admissao || null,
      salario:         values.salario ? parseFloat(values.salario) : null,
      tipo_contrato:   values.tipo_contrato || null,
      status:          values.status,
      cpf:             values.cpf || null,
      oab:             values.oab || null,
      oab_uf:          values.oab_uf || null,
      data_nascimento: values.data_nascimento || null,
      cep:             values.cep || null,
      logradouro:      values.logradouro || null,
      numero:          values.numero || null,
      complemento:     values.complemento || null,
      bairro:          values.bairro || null,
      cidade:          values.cidade || null,
      estado:          values.estado || null,
      endereco:        enderecoLegivel || null,
      observacoes:     values.observacoes || null,
      user_id:         user!.id,
    };

    if (editingMembro) {
      const { error } = await supabase.from('equipe').update(payload).eq('id', editingMembro.id);
      if (error) { toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Membro atualizado.' });
    } else {
      const { error } = await supabase.from('equipe').insert(payload);
      if (error) { toast({ title: 'Erro ao cadastrar', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Membro adicionado.' });
    }

    setIsFormOpen(false);
    setEditingMembro(null);
    loadMembros();
  };

  // ── Delete ───────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('equipe').delete().eq('id', id);
    if (error) { toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Membro removido.' });
    setDeleteId(null);
    loadMembros();
  };

  // ── Helpers ──────────────────────────────────────────────

  const getInitials = (nome: string) =>
    nome.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const getStatusColor = (status: string) => {
    if (status === 'Ativo')   return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    if (status === 'Férias')  return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
  };

  const filteredMembros = membros.filter(m =>
    m.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.cargo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.oab ?? '').includes(searchTerm)
  );

  const rolesDisponiveis = assignableRoles(role as AppRole ?? 'READONLY');

  // ── Form fields ──────────────────────────────────────────

  const formFields = (
    <Tabs defaultValue="identificacao" className="w-full">
      <TabsList className="grid grid-cols-4 w-full mb-4">
        <TabsTrigger value="identificacao" className="text-xs">Identificação</TabsTrigger>
        <TabsTrigger value="contato"       className="text-xs">Contato</TabsTrigger>
        <TabsTrigger value="endereco"      className="text-xs">Endereço</TabsTrigger>
        <TabsTrigger value="acesso"        className="text-xs">Acesso</TabsTrigger>
      </TabsList>

      {/* ── Identificação ── */}
      <TabsContent value="identificacao" className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="nome" render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel>Nome Completo *</FormLabel>
              <FormControl><Input placeholder="Ex: Maria da Silva" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="cpf" render={({ field }) => (
            <FormItem>
              <FormLabel>CPF</FormLabel>
              <FormControl><Input placeholder="000.000.000-00" {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="data_nascimento" render={({ field }) => (
            <FormItem>
              <FormLabel>Data de Nascimento</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="oab" render={({ field }) => (
            <FormItem>
              <FormLabel>OAB</FormLabel>
              <FormControl><Input placeholder="123456" {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="oab_uf" render={({ field }) => (
            <FormItem>
              <FormLabel>OAB — UF</FormLabel>
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>{UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
              </Select>
            </FormItem>
          )} />
          <FormField control={form.control} name="cargo" render={({ field }) => (
            <FormItem>
              <FormLabel>Cargo *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{CARGOS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="departamento" render={({ field }) => (
            <FormItem>
              <FormLabel>Departamento *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{DEPARTAMENTOS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="tipo_contrato" render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Contrato</FormLabel>
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{CONTRATOS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </FormItem>
          )} />
          <FormField control={form.control} name="data_admissao" render={({ field }) => (
            <FormItem>
              <FormLabel>Data de Admissão</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
            </FormItem>
          )} />
          <PermissionGate action="view:salario">
            <FormField control={form.control} name="salario" render={({ field }) => (
              <FormItem>
                <FormLabel>Salário (R$)</FormLabel>
                <FormControl><Input type="number" step="0.01" placeholder="0,00" {...field} /></FormControl>
              </FormItem>
            )} />
          </PermissionGate>
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Inativo">Inativo</SelectItem>
                  <SelectItem value="Férias">Férias</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="observacoes" render={({ field }) => (
          <FormItem>
            <FormLabel>Observações</FormLabel>
            <FormControl><Textarea rows={2} className="resize-none" placeholder="Anotações internas..." {...field} /></FormControl>
          </FormItem>
        )} />
      </TabsContent>

      {/* ── Contato ── */}
      <TabsContent value="contato" className="space-y-3">
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>E-mail *</FormLabel>
            <FormControl><Input type="email" placeholder="email@escritorio.com" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="telefone" render={({ field }) => (
            <FormItem>
              <FormLabel>Telefone</FormLabel>
              <FormControl><Input placeholder="(11) 99999-9999" {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="whatsapp" render={({ field }) => (
            <FormItem>
              <FormLabel>WhatsApp</FormLabel>
              <FormControl><Input placeholder="(11) 99999-9999" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>
      </TabsContent>

      {/* ── Endereço ── */}
      <TabsContent value="endereco" className="space-y-3">
        <div className="flex gap-2 items-end">
          <FormField control={form.control} name="cep" render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>CEP</FormLabel>
              <FormControl><Input placeholder="00000-000" {...field} onBlur={handleCepBlur} /></FormControl>
            </FormItem>
          )} />
          {cepLoading && <Loader2 className="w-4 h-4 animate-spin mb-2.5 text-muted-foreground" />}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="logradouro" render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel>Logradouro</FormLabel>
              <FormControl><Input placeholder="Rua, Av..." {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="numero" render={({ field }) => (
            <FormItem>
              <FormLabel>Número</FormLabel>
              <FormControl><Input placeholder="123" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="complemento" render={({ field }) => (
            <FormItem>
              <FormLabel>Complemento</FormLabel>
              <FormControl><Input placeholder="Apto, Sala..." {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="bairro" render={({ field }) => (
            <FormItem>
              <FormLabel>Bairro</FormLabel>
              <FormControl><Input {...field} /></FormControl>
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="cidade" render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel>Cidade</FormLabel>
              <FormControl><Input {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="estado" render={({ field }) => (
            <FormItem>
              <FormLabel>UF</FormLabel>
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>{UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
              </Select>
            </FormItem>
          )} />
        </div>
      </TabsContent>

      {/* ── Acesso ao sistema ── */}
      <TabsContent value="acesso" className="space-y-4">
        <PermissionGate action="manage:roles" fallback={
          <p className="text-xs text-muted-foreground text-center py-4">
            Apenas titulares e administradores podem gerenciar níveis de acesso.
          </p>
        }>
          <FormField control={form.control} name="nivel_acesso" render={({ field }) => (
            <FormItem>
              <FormLabel>Nível de acesso no sistema</FormLabel>
              <Select value={field.value ?? 'READONLY'} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {rolesDisponiveis.map(r => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Define o que este membro pode ver e fazer quando acessar o sistema.
              </p>
            </FormItem>
          )} />

          <FormField control={form.control} name="pode_assinar" render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <FormLabel className="text-sm font-medium">Pode assinar documentos</FormLabel>
                <p className="text-xs text-muted-foreground">Autorizado a assinar documentos pelo escritório</p>
              </div>
              <FormControl>
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )} />
        </PermissionGate>

        <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Convite de acesso</p>
          <p className="text-xs text-muted-foreground">
            Para que este membro acesse o sistema com login próprio, envie um convite por e-mail
            após salvar o cadastro. (Em breve)
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );

  // ── View de detalhes ─────────────────────────────────────

  const viewContent = viewingMembro && (
    <div className="space-y-3 text-sm">
      {[
        { icon: Briefcase, label: 'Cargo',        value: viewingMembro.cargo },
        { icon: Briefcase, label: 'Departamento', value: viewingMembro.departamento },
        viewingMembro.oab && { icon: FileText,  label: 'OAB', value: `${viewingMembro.oab}${viewingMembro.oab_uf ? `/${viewingMembro.oab_uf}` : ''}` },
        viewingMembro.cpf && { icon: FileText,  label: 'CPF', value: viewingMembro.cpf },
        viewingMembro.tipo_contrato && { icon: FileText, label: 'Contrato', value: viewingMembro.tipo_contrato },
        { icon: Mail,   label: 'E-mail',    value: viewingMembro.email },
        viewingMembro.telefone && { icon: Phone, label: 'Telefone', value: viewingMembro.telefone },
        viewingMembro.whatsapp && { icon: Phone, label: 'WhatsApp', value: viewingMembro.whatsapp },
        viewingMembro.endereco && { icon: MapPin, label: 'Endereço', value: viewingMembro.endereco },
        viewingMembro.data_admissao && {
          icon: Briefcase, label: 'Admissão',
          value: format(new Date(viewingMembro.data_admissao + 'T12:00:00'), 'dd/MM/yyyy'),
        },
        viewingMembro.nivel_acesso && {
          icon: ShieldCheck, label: 'Nível de acesso',
          value: ROLE_LABELS[viewingMembro.nivel_acesso as AppRole] ?? viewingMembro.nivel_acesso,
        },
        can('view:salario') && viewingMembro.salario != null && {
          icon: Briefcase, label: 'Salário',
          value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(viewingMembro.salario),
        },
        viewingMembro.observacoes && { icon: FileText, label: 'Observações', value: viewingMembro.observacoes },
      ].filter(Boolean).map((item: any, i) => (
        <div key={i} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
          <item.icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="font-medium">{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );

  // ── Render ───────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestão de Equipe</h1>
          <p className="text-muted-foreground">Membros, cargos e níveis de acesso</p>
        </div>
        <PermissionGate action="create:equipe">
          <Button onClick={() => handleOpenForm()}>
            <UserPlus className="w-4 h-4 mr-2" />
            Adicionar Membro
          </Button>
        </PermissionGate>
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Buscar por nome, e-mail, cargo ou OAB..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total',         valor: membros.length,                                    color: 'text-blue-600' },
          { label: 'Ativos',        valor: membros.filter(m => m.status === 'Ativo').length,   color: 'text-green-600' },
          { label: 'Em Férias',     valor: membros.filter(m => m.status === 'Férias').length,  color: 'text-yellow-600' },
          { label: 'Departamentos', valor: new Set(membros.map(m => m.departamento)).size,     color: 'text-purple-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <UserCheck className={`h-6 w-6 ${s.color}`} />
              <div>
                <p className="text-xl font-bold">{s.valor}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Grid de cards */}
      {filteredMembros.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <UserCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum membro encontrado</h3>
            <p className="text-muted-foreground text-sm">
              {searchTerm ? 'Tente ajustar a busca.' : 'Comece adicionando o primeiro membro.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredMembros.map((membro) => (
            <Card key={membro.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={membro.foto_url} />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                        {getInitials(membro.nome)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base leading-tight">{membro.nome}</CardTitle>
                      <CardDescription className="text-xs">{membro.cargo}</CardDescription>
                      {membro.oab && (
                        <p className="text-xs text-muted-foreground font-mono">
                          OAB {membro.oab}{membro.oab_uf ? `/${membro.oab_uf}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge className={getStatusColor(membro.status)}>{membro.status}</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-2">
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center text-muted-foreground gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{membro.email}</span>
                  </div>
                  {membro.telefone && (
                    <div className="flex items-center text-muted-foreground gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{membro.telefone}</span>
                    </div>
                  )}
                  <div className="flex items-center text-muted-foreground gap-2">
                    <Briefcase className="h-3.5 w-3.5" />
                    <span>{membro.departamento}</span>
                  </div>
                  {membro.nivel_acesso && (
                    <div className="flex items-center text-muted-foreground gap-2">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>{ROLE_LABELS[membro.nivel_acesso as AppRole] ?? membro.nivel_acesso}</span>
                    </div>
                  )}
                  {membro.cidade && (
                    <div className="flex items-center text-muted-foreground gap-2">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{membro.cidade}{membro.estado ? `/${membro.estado}` : ''}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="ghost" size="sm" onClick={() => setViewingMembro(membro)}>
                    Ver detalhes
                  </Button>
                  <PermissionGate action="edit:equipe">
                    <Button variant="outline" size="sm" onClick={() => handleOpenForm(membro)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  </PermissionGate>
                  <PermissionGate action="delete:equipe">
                    <Button variant="outline" size="sm" onClick={() => setDeleteId(membro.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </PermissionGate>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(v) => { setIsFormOpen(v); if (!v) setEditingMembro(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMembro ? 'Editar Membro' : 'Adicionar Membro'}</DialogTitle>
            <DialogDescription>
              {editingMembro ? 'Atualize os dados do membro.' : 'Preencha os dados para cadastrar um novo membro.'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              {formFields}
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
                <Button type="submit">{editingMembro ? 'Salvar' : 'Adicionar'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewingMembro && (
        <Dialog open={!!viewingMembro} onOpenChange={() => setViewingMembro(null)}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={viewingMembro.foto_url} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {getInitials(viewingMembro.nome)}
                  </AvatarFallback>
                </Avatar>
                {viewingMembro.nome}
              </DialogTitle>
              <DialogDescription>
                {viewingMembro.cargo} · {viewingMembro.departamento}
              </DialogDescription>
            </DialogHeader>
            {viewContent}
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O membro será permanentemente removido da equipe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
