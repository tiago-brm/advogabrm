import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateForDatabase } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Briefcase,
  Search,
  Plus,
  Calendar,
  User,
  FileText,
  Edit,
  Trash2,
  Eye,
  Clock,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const processoSchema = z.object({
  numero: z.string().min(1, "O número do processo é obrigatório."),
  cliente: z.string().min(1, "O nome do cliente é obrigatório."),
  assunto: z.string().min(1, "O assunto é obrigatório."),
  status: z.enum(["Em Andamento", "Aguardando", "Concluído"]),
  dataInicio: z.string().min(1, "A data de início é obrigatória."),
  dataLimite: z.string().min(1, "A data limite é obrigatória."),
  prioridade: z.enum(["Alta", "Média", "Baixa"]),
  responsavel: z.string().min(1, "O responsável é obrigatório."),
  valor: z.string().min(1, "O valor da causa é obrigatório."),
  instancia: z.string().min(1, "A instância é obrigatória."),
});

type Processo = z.infer<typeof processoSchema> & {
  id: string;
  clienteId?: string;
};

const Processos = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  const [processos, setProcessos] = useState<Processo[]>([]);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [membrosEquipe, setMembrosEquipe] = useState<{ id: string; nome: string }[]>([]);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedProcesso, setSelectedProcesso] = useState<Processo | null>(
    null
  );
  const [mode, setMode] = useState<"add" | "edit" | "view">("add");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [isDesktop, setIsDesktop] = useState(false);
  const { user } = useAuth();

  const formatCurrency = (num: number) =>
    num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const parseCurrency = (s: string) => {
    const n = Number(
      String(s)
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^0-9.]/g, "")
    );
    return isNaN(n) ? 0 : n;
  };

  const fetchData = async () => {
    const [procRes, cliRes, equipeRes] = await Promise.all([
      supabase
        .from("processos")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("clientes").select("id, nome"),
      supabase.from("equipe").select("id, nome").eq("status", "Ativo"),
    ]);

    if (procRes.error) {
      console.error(procRes.error);
      toast.error("Erro ao carregar processos");
      return;
    }
    if (cliRes.error) {
      console.error(cliRes.error);
      toast.error("Erro ao carregar clientes");
      return;
    }
    if (equipeRes.error) {
      console.error(equipeRes.error);
      toast.error("Erro ao carregar membros da equipe");
      return;
    }

    const clientesList = cliRes.data || [];
    const equipeList = equipeRes.data || [];
    setClientes(clientesList as any);
    setMembrosEquipe(equipeList as any);

    const processosMapped: Processo[] = (procRes.data || []).map((p: any) => ({
      id: p.id,
      numero: p.numero,
      cliente: clientesList.find((c) => c.id === p.cliente_id)?.nome || "—",
      clienteId: p.cliente_id,
      assunto: p.assunto,
      status: p.status,
      dataInicio: p.data_inicio,
      dataLimite: p.data_limite,
      prioridade: p.prioridade,
      responsavel: p.responsavel || "",
      valor: p.valor_causa != null ? formatCurrency(Number(p.valor_causa)) : "",
      instancia: p.instancia || "",
    }));
    setProcessos(processosMapped);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const form = useForm<z.infer<typeof processoSchema>>({
    resolver: zodResolver(processoSchema),
  });

  useEffect(() => {
    if (isSheetOpen) {
      if ((mode === "edit" || mode === "view") && selectedProcesso) {
        form.reset({
          ...selectedProcesso,
          cliente: selectedProcesso.clienteId || "",
        });
      } else {
        form.reset({
          numero: "",
          cliente: "",
          assunto: "",
          status: "Em Andamento",
          dataInicio: "",
          dataLimite: "",
          prioridade: "Média",
          responsavel: "",
          valor: "",
          instancia: "1ª Instância",
        });
      }
    }
  }, [isSheetOpen, selectedProcesso, mode, form]);

  const onSubmit = async (values: z.infer<typeof processoSchema>) => {
    if (!user) {
      toast.error("É necessário estar logado.");
      return;
    }
    try {
      const processoData = {
        numero: values.numero,
        cliente_id: values.cliente,
        assunto: values.assunto,
        status: values.status,
        data_inicio: formatDateForDatabase(values.dataInicio),
        data_limite: formatDateForDatabase(values.dataLimite),
        prioridade: values.prioridade,
        responsavel: values.responsavel,
        valor_causa: parseCurrency(values.valor),
        instancia: values.instancia,
        user_id: user.id,
      };

      if (mode === "add") {
        const { data, error } = await supabase
          .from("processos")
          .insert(processoData)
          .select("*")
          .single();
        if (error) throw error;
        const clienteNome =
          clientes.find((c) => c.id === (data as any).cliente_id)?.nome || "—";
        const novo: Processo = {
          id: (data as any).id,
          numero: (data as any).numero,
          cliente: clienteNome,
          clienteId: (data as any).cliente_id,
          assunto: (data as any).assunto,
          status: (data as any).status,
          dataInicio: (data as any).data_inicio,
          dataLimite: (data as any).data_limite,
          prioridade: (data as any).prioridade,
          responsavel: (data as any).responsavel || "",
          valor:
            (data as any).valor_causa != null
              ? formatCurrency(Number((data as any).valor_causa))
              : "",
          instancia: (data as any).instancia || "",
        };
        setProcessos((prev) => [novo, ...prev]);
        toast.success("Processo criado com sucesso!");
      } else if (mode === "edit" && selectedProcesso) {
        const { error } = await supabase
          .from("processos")
          .update({
            numero: values.numero,
            cliente_id: values.cliente,
            assunto: values.assunto,
            status: values.status,
            data_inicio: formatDateForDatabase(values.dataInicio),
            data_limite: formatDateForDatabase(values.dataLimite),
            prioridade: values.prioridade,
            responsavel: values.responsavel,
            valor_causa: parseCurrency(values.valor),
            instancia: values.instancia,
          })
          .eq("id", selectedProcesso.id);
        if (error) throw error;
        setProcessos((prev) =>
          prev.map((p) =>
            p.id === selectedProcesso.id
              ? {
                  id: selectedProcesso.id,
                  numero: values.numero,
                  cliente:
                    clientes.find((c) => c.id === values.cliente)?.nome ||
                    selectedProcesso.cliente,
                  clienteId: values.cliente,
                  assunto: values.assunto,
                  status: values.status,
                  dataInicio: values.dataInicio,
                  dataLimite: values.dataLimite,
                  prioridade: values.prioridade,
                  responsavel: values.responsavel,
                  valor: formatCurrency(parseCurrency(values.valor)),
                  instancia: values.instancia,
                }
              : p
          )
        );
        toast.success("Processo atualizado com sucesso!");
      }
      setIsSheetOpen(false);
      setSelectedProcesso(null);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar processo");
    }
  };

  const handleAddNew = () => {
    setMode("add");
    setSelectedProcesso(null);
    setIsSheetOpen(true);
  };

  const handleEdit = (processo: Processo) => {
    setMode("edit");
    setSelectedProcesso(processo);
    setIsSheetOpen(true);
  };

  const handleView = (processo: Processo) => {
    setMode("view");
    setSelectedProcesso(processo);
    setIsSheetOpen(true);
  };

  const handleDeleteClick = (processo: Processo) => {
    setSelectedProcesso(processo);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedProcesso) return;
    try {
      const { error } = await supabase
        .from("processos")
        .delete()
        .eq("id", selectedProcesso.id);
      if (error) throw error;
      setProcessos((prev) => prev.filter((p) => p.id !== selectedProcesso.id));
      toast.success("Processo excluído com sucesso.");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao excluir processo");
    }
    setIsDeleteDialogOpen(false);
    setSelectedProcesso(null);
  };

  const estatisticas = [
    {
      titulo: "Total de Processos",
      valor: String(processos.length),
      icone: Briefcase,
      cor: "text-blue-500",
      fundo: "bg-blue-500/10",
    },
    {
      titulo: "Em Andamento",
      valor: String(
        processos.filter((p) => p.status === "Em Andamento").length
      ),
      icone: Clock,
      cor: "text-orange-500",
      fundo: "bg-orange-500/10",
    },
    {
      titulo: "Concluídos",
      valor: String(processos.filter((p) => p.status === "Concluído").length),
      icone: CheckCircle,
      cor: "text-green-500",
      fundo: "bg-green-500/10",
    },
    {
      titulo: "Atrasados",
      valor: String(
        processos.filter(
          (p) => p.status !== "Concluído" && new Date(p.dataLimite) < new Date()
        ).length
      ),
      icone: AlertTriangle,
      cor: "text-red-500",
      fundo: "bg-red-500/10",
    },
  ];

  const filteredProcessos = processos.filter((processo) => {
    const matchesSearch =
      processo.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      processo.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
      processo.assunto.toLowerCase().includes(searchTerm.toLowerCase());

    const statusString = String(processo.status);
    const matchesStatus =
      statusFilter === "todos" || statusString === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Em Andamento":
        return "bg-blue-500/10 text-blue-500 border border-blue-500/20";
      case "Aguardando":
        return "bg-orange-500/10 text-orange-500 border border-orange-500/20";
      case "Concluído":
        return "bg-green-500/10 text-green-500 border border-green-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border border-gray-500/20";
    }
  };

  const getPrioridadeBadge = (prioridade: string) => {
    switch (prioridade) {
      case "Alta":
        return "bg-red-500/10 text-red-500 border border-red-500/20";
      case "Média":
        return "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20";
      case "Baixa":
        return "bg-green-500/10 text-green-500 border border-green-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border border-gray-500/20";
    }
  };

  const renderForm = () => (
    <Form {...form}>
      <form
        id="processo-form"
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 px-1 py-4"
      >
        <FormField
          control={form.control}
          name="numero"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel className="text-sm font-medium">
                Número do Processo
              </FormLabel>
              <FormControl>
                <Input {...field} className="text-sm" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cliente"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel className="text-sm font-medium">Cliente</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {clientes.map((cliente) => (
                    <SelectItem key={cliente.id} value={cliente.id}>
                      {cliente.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="assunto"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel className="text-sm font-medium">Assunto</FormLabel>
              <FormControl>
                <Textarea {...field} className="text-sm min-h-[80px]" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                  <SelectItem value="Aguardando">Aguardando</SelectItem>
                  <SelectItem value="Concluído">Concluído</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="prioridade"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">Prioridade</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Alta">Alta</SelectItem>
                  <SelectItem value="Média">Média</SelectItem>
                  <SelectItem value="Baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dataInicio"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">
                Data de Início
              </FormLabel>
              <FormControl>
                <Input type="date" {...field} className="text-sm" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dataLimite"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">Data Limite</FormLabel>
              <FormControl>
                <Input type="date" {...field} className="text-sm" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="responsavel"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">Responsável</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Selecione um responsável" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {membrosEquipe.length > 0 ? (
                    membrosEquipe.map((membro) => (
                      <SelectItem key={membro.id} value={membro.nome}>
                        {membro.nome}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Nenhum membro da equipe encontrado
                    </div>
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="valor"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">
                Valor da Causa
              </FormLabel>
              <FormControl>
                <Input {...field} className="text-sm" placeholder="R$ 0,00" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="instancia"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel className="text-sm font-medium">Instância</FormLabel>
              <FormControl>
                <Input {...field} className="text-sm" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );

  const renderView = () =>
    selectedProcesso && (
      <div className="space-y-4 px-1 py-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label className="text-xs sm:text-sm font-medium">Número</Label>
            <p className="text-sm sm:text-base font-mono">
              {selectedProcesso.numero}
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs sm:text-sm font-medium">Cliente</Label>
            <p className="text-sm sm:text-base">{selectedProcesso.cliente}</p>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs sm:text-sm font-medium">Assunto</Label>
            <p className="text-sm sm:text-base">{selectedProcesso.assunto}</p>
          </div>
          <div>
            <Label className="text-xs sm:text-sm font-medium">Status</Label>
            <div className="mt-1">
              <Badge className={getStatusBadge(selectedProcesso.status)}>
                {selectedProcesso.status}
              </Badge>
            </div>
          </div>
          <div>
            <Label className="text-xs sm:text-sm font-medium">Prioridade</Label>
            <div className="mt-1">
              <Badge
                className={getPrioridadeBadge(selectedProcesso.prioridade)}
              >
                {selectedProcesso.prioridade}
              </Badge>
            </div>
          </div>
          <div>
            <Label className="text-xs sm:text-sm font-medium">
              Data de Início
            </Label>
            <p className="text-sm sm:text-base">
              {new Date(selectedProcesso.dataInicio).toLocaleDateString()}
            </p>
          </div>
          <div>
            <Label className="text-xs sm:text-sm font-medium">
              Data Limite
            </Label>
            <p className="text-sm sm:text-base">
              {new Date(selectedProcesso.dataLimite).toLocaleDateString()}
            </p>
          </div>
          <div>
            <Label className="text-xs sm:text-sm font-medium">
              Responsável
            </Label>
            <p className="text-sm sm:text-base">
              {selectedProcesso.responsavel}
            </p>
          </div>
          <div>
            <Label className="text-xs sm:text-sm font-medium">
              Valor da Causa
            </Label>
            <p className="text-sm sm:text-base font-semibold">
              {selectedProcesso.valor}
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs sm:text-sm font-medium">Instância</Label>
            <p className="text-sm sm:text-base">{selectedProcesso.instancia}</p>
          </div>
        </div>
      </div>
    );

  const renderSheetContent = () => (
    <>
      <SheetHeader className="px-3 sm:px-6">
        <SheetTitle className="text-lg sm:text-xl">
          {mode === "add" && "Novo Processo"}
          {mode === "edit" && "Editar Processo"}
          {mode === "view" && "Detalhes do Processo"}
        </SheetTitle>
        <SheetDescription className="text-sm sm:text-base">
          {mode === "add" && "Preencha os dados para criar um novo processo."}
          {mode === "edit" && "Altere os dados do processo."}
          {mode === "view" && "Visualize os detalhes do processo."}
        </SheetDescription>
      </SheetHeader>
      <div className="px-3 sm:px-6 flex-1 overflow-y-auto">
        {mode === "view" ? renderView() : renderForm()}
      </div>
      <SheetFooter className="px-3 sm:px-6 flex-col sm:flex-row gap-2 sm:gap-0">
        <SheetClose asChild>
          <Button
            variant="outline"
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            Fechar
          </Button>
        </SheetClose>
        {mode !== "view" && (
          <Button
            type="submit"
            form="processo-form"
            className="w-full sm:w-auto order-1 sm:order-2"
          >
            Salvar
          </Button>
        )}
      </SheetFooter>
    </>
  );

  const renderDialogContent = () => (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg sm:text-xl">
          {mode === "add" && "Novo Processo"}
          {mode === "edit" && "Editar Processo"}
          {mode === "view" && "Detalhes do Processo"}
        </DialogTitle>
      </DialogHeader>
      <div className="max-h-[60vh] overflow-y-auto">
        {mode === "view" ? renderView() : renderForm()}
      </div>
      <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
        <Button
          variant="outline"
          onClick={() => setIsSheetOpen(false)}
          className="w-full sm:w-auto order-2 sm:order-1"
        >
          Fechar
        </Button>
        {mode !== "view" && (
          <Button
            type="submit"
            form="processo-form"
            className="w-full sm:w-auto order-1 sm:order-2"
          >
            Salvar
          </Button>
        )}
      </DialogFooter>
    </>
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Processos
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Gerencie todos os processos do escritório
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/90 w-full sm:w-auto"
          onClick={handleAddNew}
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Processo
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {estatisticas.map((stat, index) => (
          <Card key={index} className="gradient-card">
            <CardContent className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    {stat.titulo}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold">{stat.valor}</p>
                </div>
                <div
                  className={`p-2 sm:p-3 rounded-lg ${stat.fundo} self-end sm:self-auto`}
                >
                  <stat.icone className={`w-4 h-4 sm:w-6 sm:h-6 ${stat.cor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros e Pesquisa */}
      <Card className="gradient-card">
        <CardContent className="p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Pesquisar por número, cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 text-sm sm:text-base"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                <SelectItem value="Aguardando">Aguardando</SelectItem>
                <SelectItem value="Concluído">Concluído</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Processos */}
      <Card className="gradient-card">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">
            Lista de Processos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          <div className="space-y-3 sm:space-y-4">
            {filteredProcessos.map((processo) => (
              <div
                key={processo.id}
                className="p-3 sm:p-6 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                      <h3 className="font-semibold text-base sm:text-lg truncate">
                        {processo.numero}
                      </h3>
                      <div className="flex gap-2 flex-wrap">
                        <Badge className={getStatusBadge(processo.status)}>
                          {processo.status}
                        </Badge>
                        <Badge
                          className={getPrioridadeBadge(processo.prioridade)}
                        >
                          {processo.prioridade}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-muted-foreground mb-3 text-sm sm:text-base line-clamp-2">
                      {processo.assunto}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 text-xs sm:text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="truncate">{processo.cliente}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="truncate">
                          Limite:{" "}
                          {format(
                            new Date(processo.dataLimite + "T00:00:00"),
                            "dd/MM/yyyy",
                            { locale: ptBR }
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <FileText className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="truncate">{processo.responsavel}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="font-medium text-foreground truncate">
                          {processo.valor}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                      onClick={() => handleView(processo)}
                    >
                      <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                      onClick={() => handleEdit(processo)}
                    >
                      <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 h-8 w-8 sm:h-9 sm:w-9 p-0"
                      onClick={() => handleDeleteClick(processo)}
                    >
                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 pt-3 sm:pt-4 border-t border-border/50">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs text-muted-foreground">
                    <span>
                      Iniciado em{" "}
                      {format(
                        new Date(processo.dataInicio + "T00:00:00"),
                        "dd/MM/yyyy",
                        { locale: ptBR }
                      )}
                    </span>
                    <span className="hidden sm:inline">•</span>
                    <span>{processo.instancia}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto text-xs sm:text-sm"
                    onClick={() => handleView(processo)}
                  >
                    Ver Detalhes
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {filteredProcessos.length === 0 && (
            <div className="text-center py-8">
              <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                Nenhum processo encontrado
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {isDesktop ? (
        <Dialog open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <DialogContent className="sm:max-w-[600px]">
            {renderDialogContent()}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
            {renderSheetContent()}
          </SheetContent>
        </Sheet>
      )}

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="mx-4 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg sm:text-xl">
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm sm:text-base">
              Tem certeza que deseja excluir este processo? Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto order-2 sm:order-1">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="w-full sm:w-auto order-1 sm:order-2"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Processos;
