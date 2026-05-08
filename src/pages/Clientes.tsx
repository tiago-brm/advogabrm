import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Briefcase,
  Edit,
  Trash2,
  Eye,
  Info,
  MoreHorizontal,
  Loader2,
  MessageSquare,
  PhoneCall,
  Send,
  Building2,
  User,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

// ─── Types ──────────────────────────────────────────────────

type DbCliente = Tables<"clientes">;
type DbInteracao = Tables<"cliente_interacoes">;

// ─── Schema ──────────────────────────────────────────────────

const clienteSchema = z.object({
  tipo_pessoa: z.enum(["PF", "PJ"]),
  nome: z.string().min(3, "Mínimo 3 caracteres"),
  razao_social: z.string().optional(),
  cpf_cnpj: z.string().optional(),
  rg: z.string().optional(),
  data_nascimento: z.string().optional(),
  profissao: z.string().optional(),
  email: z.string().email("E-mail inválido"),
  telefone: z.string().min(10, "Mínimo 10 dígitos"),
  telefone_secundario: z.string().optional(),
  whatsapp: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  origem: z.string().optional(),
  observacoes: z.string().optional(),
});

type ClienteFormValues = z.infer<typeof clienteSchema>;

const INTERACAO_TIPOS = ["Ligação", "Reunião", "E-mail", "WhatsApp", "Outro"] as const;
const ORIGENS = ["Indicação", "Site", "Evento", "Redes Sociais", "Outro"] as const;
const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

// ─── ViaCEP ──────────────────────────────────────────────────

async function buscarViaCep(cep: string) {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = await res.json();
    if (data.erro) return null;
    return data as { logradouro: string; bairro: string; localidade: string; uf: string };
  } catch {
    return null;
  }
}

// ─── Ícone de interação ──────────────────────────────────────

function InteracaoIcon({ tipo }: { tipo: string }) {
  switch (tipo) {
    case "Ligação": return <PhoneCall className="w-3.5 h-3.5" />;
    case "WhatsApp": return <MessageSquare className="w-3.5 h-3.5" />;
    case "E-mail": return <Send className="w-3.5 h-3.5" />;
    case "Reunião": return <Users className="w-3.5 h-3.5" />;
    default: return <Info className="w-3.5 h-3.5" />;
  }
}

// ─── Componente principal ────────────────────────────────────

const Clientes = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [clientes, setClientes] = useState<DbCliente[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<DbCliente | null>(null);
  const [clienteToDelete, setClienteToDelete] = useState<string | null>(null);
  const [viewingCliente, setViewingCliente] = useState<DbCliente | null>(null);
  const [cepLoading, setCepLoading] = useState(false);

  // Interações
  const [interacoes, setInteracoes] = useState<DbInteracao[]>([]);
  const [novaInteracaoTipo, setNovaInteracaoTipo] = useState<string>("Ligação");
  const [novaInteracaoDesc, setNovaInteracaoDesc] = useState("");
  const [salvandoInteracao, setSalvandoInteracao] = useState(false);

  const { toast } = useToast();
  const isMobile = useIsMobile();

  const form = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      tipo_pessoa: "PF",
      nome: "",
      email: "",
      telefone: "",
    },
  });

  const tipoPessoa = form.watch("tipo_pessoa");

  // ── Fetch ──────────────────────────────────────────────────

  const fetchClientes = async () => {
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar clientes", description: error.message, variant: "destructive" });
      return;
    }
    setClientes(data ?? []);
  };

  const fetchInteracoes = async (clienteId: string) => {
    const { data } = await supabase
      .from("cliente_interacoes")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("data_interacao", { ascending: false });
    setInteracoes(data ?? []);
  };

  useEffect(() => { fetchClientes(); }, []);

  useEffect(() => {
    if (viewingCliente) fetchInteracoes(viewingCliente.id);
    else setInteracoes([]);
  }, [viewingCliente]);

  // ── CEP lookup ─────────────────────────────────────────────

  const handleCepBlur = async () => {
    const cep = form.getValues("cep") ?? "";
    if (cep.replace(/\D/g, "").length !== 8) return;
    setCepLoading(true);
    const data = await buscarViaCep(cep);
    setCepLoading(false);
    if (!data) {
      toast({ title: "CEP não encontrado", variant: "destructive" });
      return;
    }
    form.setValue("logradouro", data.logradouro);
    form.setValue("bairro", data.bairro);
    form.setValue("cidade", data.localidade);
    form.setValue("estado", data.uf);
  };

  // ── Form open ──────────────────────────────────────────────

  const handleOpenForm = (cliente?: DbCliente) => {
    if (cliente) {
      setEditingCliente(cliente);
      form.reset({
        tipo_pessoa: (cliente.tipo_pessoa as "PF" | "PJ") ?? "PF",
        nome: cliente.nome,
        razao_social: cliente.razao_social ?? "",
        cpf_cnpj: cliente.cpf_cnpj ?? "",
        rg: cliente.rg ?? "",
        data_nascimento: cliente.data_nascimento ?? "",
        profissao: cliente.profissao ?? "",
        email: cliente.email,
        telefone: cliente.telefone ?? "",
        telefone_secundario: cliente.telefone_secundario ?? "",
        whatsapp: cliente.whatsapp ?? "",
        cep: cliente.cep ?? "",
        logradouro: cliente.logradouro ?? "",
        numero: cliente.numero ?? "",
        complemento: cliente.complemento ?? "",
        bairro: cliente.bairro ?? "",
        cidade: cliente.cidade ?? "",
        estado: cliente.estado ?? "",
        origem: cliente.origem ?? "",
        observacoes: cliente.observacoes ?? "",
      });
    } else {
      setEditingCliente(null);
      form.reset({ tipo_pessoa: "PF", nome: "", email: "", telefone: "" });
    }
    setIsFormOpen(true);
  };

  // ── Submit ─────────────────────────────────────────────────

  const onSubmit = async (values: ClienteFormValues) => {
    const enderecoLegivel = [
      values.logradouro,
      values.numero && `nº ${values.numero}`,
      values.complemento,
      values.bairro,
      values.cidade && values.estado ? `${values.cidade}/${values.estado}` : values.cidade,
    ].filter(Boolean).join(", ");

    const payload = {
      tipo_pessoa: values.tipo_pessoa,
      nome: values.nome,
      razao_social: values.razao_social || null,
      cpf_cnpj: values.cpf_cnpj || null,
      rg: values.rg || null,
      data_nascimento: values.data_nascimento || null,
      profissao: values.profissao || null,
      email: values.email,
      telefone: values.telefone,
      telefone_secundario: values.telefone_secundario || null,
      whatsapp: values.whatsapp || null,
      cep: values.cep || null,
      logradouro: values.logradouro || null,
      numero: values.numero || null,
      complemento: values.complemento || null,
      bairro: values.bairro || null,
      cidade: values.cidade || null,
      estado: values.estado || null,
      endereco: enderecoLegivel || null,
      origem: values.origem || null,
      observacoes: values.observacoes || null,
    };

    if (editingCliente) {
      const { error } = await supabase.from("clientes").update(payload).eq("id", editingCliente.id);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Cliente atualizado com sucesso." });
    } else {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) { toast({ title: "Não autenticado", variant: "destructive" }); return; }
      const { error } = await supabase.from("clientes").insert({ ...payload, user_id: userId });
      if (error) { toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Novo cliente adicionado." });
    }
    setIsFormOpen(false);
    await fetchClientes();
    setEditingCliente(null);
  };

  // ── Delete ─────────────────────────────────────────────────

  const handleDeleteCliente = async (id: string) => {
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Cliente excluído com sucesso." });
    await fetchClientes();
    setClienteToDelete(null);
  };

  // ── Interação ──────────────────────────────────────────────

  const handleSalvarInteracao = async () => {
    if (!viewingCliente || !novaInteracaoDesc.trim()) return;
    setSalvandoInteracao(true);
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) { setSalvandoInteracao(false); return; }

    const { error } = await supabase.from("cliente_interacoes").insert({
      cliente_id: viewingCliente.id,
      user_id: userId,
      tipo: novaInteracaoTipo,
      descricao: novaInteracaoDesc.trim(),
    });
    setSalvandoInteracao(false);
    if (error) { toast({ title: "Erro ao salvar interação", description: error.message, variant: "destructive" }); return; }
    setNovaInteracaoDesc("");
    await fetchInteracoes(viewingCliente.id);

    // atualiza ultimo_contato
    await supabase.from("clientes").update({ ultimo_contato: new Date().toISOString() }).eq("id", viewingCliente.id);
    await fetchClientes();
  };

  const handleDeleteInteracao = async (id: string) => {
    await supabase.from("cliente_interacoes").delete().eq("id", id);
    if (viewingCliente) fetchInteracoes(viewingCliente.id);
  };

  // ── Stats ──────────────────────────────────────────────────

  const totalClientes = clientes.length;
  const clientesAtivos = clientes.filter((c) => c.status === "Ativo").length;
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const novosEsteMes = clientes.filter((c) => c.data_registro && new Date(c.data_registro) >= firstDayOfMonth).length;

  const filteredClientes = clientes.filter((c) =>
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.cpf_cnpj ?? "").includes(searchTerm) ||
    (c.cidade ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) =>
    status === "Ativo"
      ? "bg-green-500/10 text-green-500 border border-green-500/20"
      : "bg-gray-500/10 text-gray-500 border border-gray-500/20";

  // ── Form fields ────────────────────────────────────────────

  const formFields = (
    <div className="space-y-5">
      {/* Tipo de pessoa */}
      <FormField control={form.control} name="tipo_pessoa" render={({ field }) => (
        <FormItem>
          <FormLabel>Tipo de Pessoa</FormLabel>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={field.value === "PF" ? "default" : "outline"}
              onClick={() => field.onChange("PF")} className="flex-1 gap-1.5">
              <User className="w-3.5 h-3.5" /> Pessoa Física
            </Button>
            <Button type="button" size="sm" variant={field.value === "PJ" ? "default" : "outline"}
              onClick={() => field.onChange("PJ")} className="flex-1 gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Pessoa Jurídica
            </Button>
          </div>
        </FormItem>
      )} />

      {/* Identificação */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Identificação</p>
        <FormField control={form.control} name="nome" render={({ field }) => (
          <FormItem>
            <FormLabel>{tipoPessoa === "PJ" ? "Nome Fantasia" : "Nome Completo"} *</FormLabel>
            <FormControl><Input placeholder={tipoPessoa === "PJ" ? "Ex: Empresa ABC" : "Ex: João da Silva"} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        {tipoPessoa === "PJ" && (
          <FormField control={form.control} name="razao_social" render={({ field }) => (
            <FormItem>
              <FormLabel>Razão Social</FormLabel>
              <FormControl><Input placeholder="Ex: Empresa ABC Ltda" {...field} /></FormControl>
            </FormItem>
          )} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="cpf_cnpj" render={({ field }) => (
            <FormItem>
              <FormLabel>{tipoPessoa === "PJ" ? "CNPJ" : "CPF"}</FormLabel>
              <FormControl><Input placeholder={tipoPessoa === "PJ" ? "00.000.000/0000-00" : "000.000.000-00"} {...field} /></FormControl>
            </FormItem>
          )} />
          {tipoPessoa === "PF" ? (
            <FormField control={form.control} name="rg" render={({ field }) => (
              <FormItem>
                <FormLabel>RG</FormLabel>
                <FormControl><Input placeholder="00.000.000-0" {...field} /></FormControl>
              </FormItem>
            )} />
          ) : (
            <div /> // espaço vazio para PJ
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {tipoPessoa === "PF" && (
            <FormField control={form.control} name="data_nascimento" render={({ field }) => (
              <FormItem>
                <FormLabel>Data de Nascimento</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
              </FormItem>
            )} />
          )}
          <FormField control={form.control} name="profissao" render={({ field }) => (
            <FormItem className={tipoPessoa === "PJ" ? "col-span-2" : ""}>
              <FormLabel>{tipoPessoa === "PJ" ? "Segmento / Ramo" : "Profissão"}</FormLabel>
              <FormControl><Input placeholder={tipoPessoa === "PJ" ? "Ex: Construção Civil" : "Ex: Empresário"} {...field} /></FormControl>
            </FormItem>
          )} />
        </div>
      </div>

      {/* Contato */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contato</p>
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>E-mail *</FormLabel>
            <FormControl><Input type="email" placeholder="email@exemplo.com" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="telefone" render={({ field }) => (
            <FormItem>
              <FormLabel>Telefone *</FormLabel>
              <FormControl><Input placeholder="(11) 99999-9999" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="telefone_secundario" render={({ field }) => (
            <FormItem>
              <FormLabel>Telefone 2</FormLabel>
              <FormControl><Input placeholder="(11) 99999-9999" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="whatsapp" render={({ field }) => (
          <FormItem>
            <FormLabel>WhatsApp</FormLabel>
            <FormControl><Input placeholder="(11) 99999-9999 — deixe em branco se igual ao telefone" {...field} /></FormControl>
          </FormItem>
        )} />
      </div>

      {/* Endereço */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endereço</p>
        <div className="flex gap-2 items-end">
          <FormField control={form.control} name="cep" render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>CEP</FormLabel>
              <FormControl>
                <Input placeholder="00000-000" {...field} onBlur={handleCepBlur} />
              </FormControl>
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
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        </div>
      </div>

      {/* Interno */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Informações Internas</p>
        <FormField control={form.control} name="origem" render={({ field }) => (
          <FormItem>
            <FormLabel>Como nos conheceu</FormLabel>
            <Select value={field.value ?? ""} onValueChange={field.onChange}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {ORIGENS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormItem>
        )} />
        <FormField control={form.control} name="observacoes" render={({ field }) => (
          <FormItem>
            <FormLabel>Observações internas</FormLabel>
            <FormControl>
              <Textarea placeholder="Anotações para uso do escritório..." className="resize-none" rows={3} {...field} />
            </FormControl>
          </FormItem>
        )} />
      </div>
    </div>
  );

  // ── View content (com abas) ────────────────────────────────

  const viewContent = viewingCliente && (
    <Tabs defaultValue="dados" className="mt-2">
      <TabsList className="w-full">
        <TabsTrigger value="dados" className="flex-1 text-xs">Dados</TabsTrigger>
        <TabsTrigger value="interacoes" className="flex-1 text-xs">
          Histórico ({interacoes.length})
        </TabsTrigger>
      </TabsList>

      {/* Aba Dados */}
      <TabsContent value="dados" className="space-y-2 text-sm pt-2">
        {[
          { icon: viewingCliente.tipo_pessoa === "PJ" ? Building2 : User, label: "Tipo", value: viewingCliente.tipo_pessoa === "PJ" ? "Pessoa Jurídica" : "Pessoa Física" },
          { icon: Users, label: "Nome", value: viewingCliente.nome },
          viewingCliente.razao_social && { icon: Building2, label: "Razão Social", value: viewingCliente.razao_social },
          viewingCliente.cpf_cnpj && { icon: Info, label: viewingCliente.tipo_pessoa === "PJ" ? "CNPJ" : "CPF", value: viewingCliente.cpf_cnpj },
          viewingCliente.rg && { icon: Info, label: "RG", value: viewingCliente.rg },
          viewingCliente.data_nascimento && { icon: Calendar, label: "Nascimento", value: new Date(viewingCliente.data_nascimento + "T12:00:00").toLocaleDateString("pt-BR") },
          viewingCliente.profissao && { icon: Briefcase, label: "Profissão", value: viewingCliente.profissao },
          { icon: Mail, label: "E-mail", value: viewingCliente.email },
          viewingCliente.telefone && { icon: Phone, label: "Telefone", value: viewingCliente.telefone },
          viewingCliente.telefone_secundario && { icon: Phone, label: "Telefone 2", value: viewingCliente.telefone_secundario },
          viewingCliente.whatsapp && { icon: MessageSquare, label: "WhatsApp", value: viewingCliente.whatsapp },
          viewingCliente.endereco && { icon: MapPin, label: "Endereço", value: viewingCliente.endereco },
          viewingCliente.origem && { icon: Info, label: "Origem", value: viewingCliente.origem },
          viewingCliente.observacoes && { icon: Info, label: "Observações", value: viewingCliente.observacoes },
          { icon: Calendar, label: "Cliente desde", value: viewingCliente.data_registro ? new Date(viewingCliente.data_registro).toLocaleDateString("pt-BR") : "-" },
          viewingCliente.ultimo_contato && { icon: Calendar, label: "Último contato", value: new Date(viewingCliente.ultimo_contato).toLocaleDateString("pt-BR") },
          { icon: Briefcase, label: "Processos ativos", value: String(viewingCliente.processos_ativos) },
        ].filter(Boolean).map((item: any, i) => (
          <div key={i} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
            <item.icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="font-medium">{item.value}</p>
            </div>
          </div>
        ))}
      </TabsContent>

      {/* Aba Histórico */}
      <TabsContent value="interacoes" className="space-y-3 pt-2">
        {/* Nova interação */}
        <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground">Registrar interação</p>
          <Select value={novaInteracaoTipo} onValueChange={setNovaInteracaoTipo}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERACAO_TIPOS.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Descreva o contato..."
            value={novaInteracaoDesc}
            onChange={(e) => setNovaInteracaoDesc(e.target.value)}
            className="resize-none text-xs"
            rows={2}
          />
          <Button size="sm" className="w-full h-7 text-xs" onClick={handleSalvarInteracao}
            disabled={!novaInteracaoDesc.trim() || salvandoInteracao}>
            {salvandoInteracao ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Salvar
          </Button>
        </div>

        {/* Timeline */}
        {interacoes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhuma interação registrada.</p>
        ) : (
          <div className="space-y-2">
            {interacoes.map((i) => (
              <div key={i.id} className="flex gap-2.5 p-2 rounded-md border bg-card text-xs group">
                <div className="mt-0.5 text-muted-foreground shrink-0">
                  <InteracaoIcon tipo={i.tipo} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{i.tipo}</span>
                    <span className="text-muted-foreground shrink-0">
                      {new Date(i.data_interacao).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 break-words">{i.descricao}</p>
                </div>
                <button
                  onClick={() => handleDeleteInteracao(i.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 mt-0.5"
                  title="Excluir"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus clientes e suas informações</p>
        </div>
        <Button onClick={() => handleOpenForm()} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-sm">
          <Plus className="w-4 h-4 mr-2" />
          Novo Cliente
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { titulo: "Total de Clientes", valor: totalClientes, icon: Users, cor: "text-primary", fundo: "bg-primary/10" },
          { titulo: "Clientes Ativos", valor: clientesAtivos, icon: Briefcase, cor: "text-green-500", fundo: "bg-green-500/10" },
          { titulo: "Novos este Mês", valor: novosEsteMes, icon: Calendar, cor: "text-accent", fundo: "bg-accent/10" },
        ].map((s) => (
          <Card key={s.titulo} className="gradient-card">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">{s.titulo}</p>
                  <p className="text-lg sm:text-2xl font-bold">{s.valor}</p>
                </div>
                <div className={`p-2 sm:p-3 rounded-lg ${s.fundo}`}>
                  <s.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${s.cor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <Card className="gradient-card">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Pesquisar por nome, e-mail, CPF/CNPJ ou cidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 text-sm"
              />
            </div>
            <Button variant="outline" onClick={() => setSearchTerm("")} className="w-full sm:w-auto">Limpar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card className="gradient-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Lista de Clientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {/* Desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Cidade / UF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Processos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClientes.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-1.5">
                          {cliente.tipo_pessoa === "PJ"
                            ? <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            : <User className="w-3.5 h-3.5 text-muted-foreground" />}
                          <p className="font-medium">{cliente.nome}</p>
                        </div>
                        {cliente.cpf_cnpj && (
                          <p className="text-xs text-muted-foreground font-mono">{cliente.cpf_cnpj}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{cliente.email}</div>
                      {cliente.telefone && <div className="text-muted-foreground text-xs">{cliente.telefone}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {cliente.cidade && cliente.estado ? `${cliente.cidade}/${cliente.estado}` : cliente.cidade ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(cliente.status)}>{cliente.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{cliente.processos_ativos} ativo(s)</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewingCliente(cliente)}>
                            <Eye className="mr-2 h-4 w-4" /> Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenForm(cliente)}>
                            <Edit className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setClienteToDelete(cliente.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3 p-4">
            {filteredClientes.map((cliente) => (
              <div key={cliente.id} className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      {cliente.tipo_pessoa === "PJ" ? <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> : <User className="w-3.5 h-3.5 text-muted-foreground" />}
                      <h3 className="font-semibold text-base">{cliente.nome}</h3>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={getStatusBadge(cliente.status)}>{cliente.status}</Badge>
                      {cliente.processos_ativos > 0 && (
                        <Badge variant="outline" className="text-xs">{cliente.processos_ativos} processo(s)</Badge>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setViewingCliente(cliente)}>
                        <Eye className="mr-2 h-4 w-4" /> Visualizar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenForm(cliente)}>
                        <Edit className="mr-2 h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setClienteToDelete(cliente.id)} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="grid grid-cols-1 gap-1.5 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4" /><span className="truncate">{cliente.email}</span>
                  </div>
                  {cliente.telefone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-4 h-4" /><span>{cliente.telefone}</span>
                    </div>
                  )}
                  {(cliente.cidade || cliente.estado) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      <span>{cliente.cidade}{cliente.estado ? `/${cliente.estado}` : ""}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredClientes.length === 0 && (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Nenhum cliente encontrado</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog / Sheet */}
      {isMobile ? (
        <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
          <SheetContent side="bottom" className="rounded-t-lg max-h-[92vh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle>{editingCliente ? "Editar Cliente" : "Novo Cliente"}</SheetTitle>
              <SheetDescription>
                {editingCliente ? "Atualize as informações do cliente." : "Preencha os dados para cadastrar um novo cliente."}
              </SheetDescription>
            </SheetHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                {formFields}
                <SheetFooter className="flex flex-col-reverse gap-2">
                  <SheetClose asChild>
                    <Button type="button" variant="outline" className="w-full">Cancelar</Button>
                  </SheetClose>
                  <Button type="submit" className="w-full">{editingCliente ? "Salvar Alterações" : "Cadastrar"}</Button>
                </SheetFooter>
              </form>
            </Form>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCliente ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
              <DialogDescription>
                {editingCliente ? "Atualize as informações do cliente." : "Preencha os dados para cadastrar um novo cliente."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
                {formFields}
                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
                  <Button type="submit">{editingCliente ? "Salvar Alterações" : "Cadastrar"}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!clienteToDelete} onOpenChange={() => setClienteToDelete(null)}>
        <AlertDialogContent className="mx-4 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Serão removidos permanentemente o cliente e todos os dados relacionados
              (processos, lançamentos financeiros, histórico de interações).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setClienteToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => clienteToDelete && handleDeleteCliente(clienteToDelete)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Dialog / Sheet */}
      {viewingCliente && (
        isMobile ? (
          <Sheet open={!!viewingCliente} onOpenChange={() => setViewingCliente(null)}>
            <SheetContent side="bottom" className="rounded-t-lg max-h-[92vh] overflow-y-auto">
              <SheetHeader className="text-left">
                <SheetTitle>Detalhes — {viewingCliente.nome}</SheetTitle>
              </SheetHeader>
              {viewContent}
              <SheetFooter className="mt-4">
                <SheetClose asChild>
                  <Button variant="outline" className="w-full">Fechar</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={!!viewingCliente} onOpenChange={() => setViewingCliente(null)}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Detalhes — {viewingCliente.nome}</DialogTitle>
                <DialogDescription>
                  {viewingCliente.tipo_pessoa === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}
                  {viewingCliente.cpf_cnpj ? ` · ${viewingCliente.cpf_cnpj}` : ""}
                </DialogDescription>
              </DialogHeader>
              {viewContent}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Fechar</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      )}
    </div>
  );
};

export default Clientes;
