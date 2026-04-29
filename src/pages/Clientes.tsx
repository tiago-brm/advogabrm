import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

const clienteSchema = z.object({
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }),
  email: z.string().email({ message: "Por favor, insira um email válido." }),
  telefone: z.string().min(10, { message: "O telefone deve ter pelo menos 10 dígitos." }),
  endereco: z.string().min(5, { message: "O endereço deve ter pelo menos 5 caracteres." }),
});

type ClienteFormValues = z.infer<typeof clienteSchema>;
type DbCliente = Tables<"clientes">;

const Clientes = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [clientes, setClientes] = useState<DbCliente[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<DbCliente | null>(null);
  const [clienteToDelete, setClienteToDelete] = useState<string | null>(null);
  const [viewingCliente, setViewingCliente] = useState<DbCliente | null>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const form = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      nome: "",
      email: "",
      telefone: "",
      endereco: "",
    },
  });

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

  useEffect(() => {
    fetchClientes();
  }, []);

  const handleOpenForm = (cliente?: DbCliente) => {
    if (cliente) {
      setEditingCliente(cliente);
      form.reset({
        nome: cliente.nome,
        email: cliente.email,
        telefone: cliente.telefone ?? "",
        endereco: cliente.endereco ?? "",
      });
    } else {
      setEditingCliente(null);
      form.reset({ nome: "", email: "", telefone: "", endereco: "" });
    }
    setIsFormOpen(true);
  };

  const onSubmit = async (data: ClienteFormValues) => {
    if (editingCliente) {
      const { error } = await supabase
        .from("clientes")
        .update({
          nome: data.nome,
          email: data.email,
          telefone: data.telefone,
          endereco: data.endereco,
        })
        .eq("id", editingCliente.id);
      if (error) {
        toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Sucesso!", description: "Cliente atualizado com sucesso." });
    } else {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) {
        toast({ title: "Não autenticado", description: "Faça login para cadastrar clientes.", variant: "destructive" });
        return;
      }
      const { error } = await supabase.from("clientes").insert({
        user_id: userId,
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        endereco: data.endereco,
      });
      if (error) {
        toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Sucesso!", description: "Novo cliente adicionado." });
    }
    setIsFormOpen(false);
    await fetchClientes();
    setEditingCliente(null);
  };
  
  const handleDeleteCliente = async (id: string) => {
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) {
      toast({ 
        title: "Erro ao excluir cliente", 
        description: `Não foi possível excluir o cliente: ${error.message}`, 
        variant: "destructive" 
      });
      return;
    }
    toast({
      title: "Cliente excluído com sucesso",
      description: "O cliente e todos os dados relacionados (processos, lançamentos financeiros) foram removidos.",
      variant: "default",
    });
    await fetchClientes();
    setClienteToDelete(null);
  };

  const totalClientes = clientes.length.toString();
  const clientesAtivos = clientes.filter((c) => c.status === "Ativo").length.toString();
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const novosEsteMes = clientes
    .filter((c) => (c.data_registro ? new Date(c.data_registro) >= firstDayOfMonth : false))
    .length
    .toString();

  const estatisticas = [
    {
      titulo: "Total de Clientes",
      valor: totalClientes,
      icone: Users,
      cor: "text-primary",
      fundo: "bg-primary/10",
    },
    {
      titulo: "Clientes Ativos",
      valor: clientesAtivos,
      icone: Briefcase,
      cor: "text-success",
      fundo: "bg-success/10",
    },
    {
      titulo: "Novos este Mês",
      valor: novosEsteMes,
      icone: Calendar,
      cor: "text-accent",
      fundo: "bg-accent/10",
    },
  ];

  const filteredClientes = clientes.filter(cliente =>
    cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    return status === "Ativo" 
      ? "bg-green-500/10 text-green-500 border border-green-500/20"
      : "bg-gray-500/10 text-gray-500 border border-gray-500/20";
  };

  const formFields = (
    <>
      <FormField
        control={form.control}
        name="nome"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-medium">Nome Completo</FormLabel>
            <FormControl>
              <Input placeholder="Ex: João da Silva" className="text-sm" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-medium">Email</FormLabel>
            <FormControl>
              <Input placeholder="Ex: joao.silva@email.com" className="text-sm" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="telefone"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-medium">Telefone</FormLabel>
            <FormControl>
              <Input placeholder="Ex: (11) 99999-9999" className="text-sm" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="endereco"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-medium">Endereço</FormLabel>
            <FormControl>
              <Input placeholder="Ex: São Paulo, SP" className="text-sm" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );

  const viewContent = viewingCliente && (
    <div className="space-y-4 py-4 text-sm">
      <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
        <Users className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Nome</p>
          <p className="font-medium">{viewingCliente.nome}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
        <Mail className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Email</p>
          <p className="font-medium">{viewingCliente.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
        <Phone className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Telefone</p>
          <p className="font-medium">{viewingCliente.telefone}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
        <MapPin className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Endereço</p>
          <p className="font-medium">{viewingCliente.endereco}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
        <Calendar className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Cliente desde</p>
          <p className="font-medium">{viewingCliente.data_registro ? new Date(viewingCliente.data_registro).toLocaleDateString("pt-BR") : "-"}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
        <Info className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="font-medium">{viewingCliente.status}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
        <Briefcase className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Processos Ativos</p>
          <p className="font-medium">{viewingCliente.processos_ativos}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
        <Calendar className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Último Contato</p>
          <p className="font-medium">{viewingCliente.ultimo_contato ? new Date(viewingCliente.ultimo_contato).toLocaleDateString("pt-BR") : "-"}</p>
        </div>
      </div>
    </div>
  );

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {estatisticas.map((stat, index) => (
          <Card key={index} className="gradient-card">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">{stat.titulo}</p>
                  <p className="text-lg sm:text-2xl font-bold">{stat.valor}</p>
                </div>
                <div className={`p-2 sm:p-3 rounded-lg ${stat.fundo}`}>
                  <stat.icone className={`w-5 h-5 sm:w-6 sm:h-6 ${stat.cor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros e Pesquisa */}
      <Card className="gradient-card">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Pesquisar clientes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 text-sm"
              />
            </div>
            <Button variant="outline" onClick={() => setSearchTerm("")} className="w-full sm:w-auto">Limpar Filtros</Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Clientes */}
      <Card className="gradient-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Lista de Clientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
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
                        <p className="font-medium">{cliente.nome}</p>
                        <p className="text-sm text-muted-foreground">{cliente.endereco}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{cliente.email}</TableCell>
                    <TableCell className="text-sm">{cliente.telefone}</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(cliente.status)}>
                        {cliente.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {cliente.processos_ativos} ativo(s)
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewingCliente(cliente)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenForm(cliente)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setClienteToDelete(cliente.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3 p-4">
            {filteredClientes.map((cliente) => (
              <div key={cliente.id} className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base">{cliente.nome}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={getStatusBadge(cliente.status)} size="sm">
                        {cliente.status}
                      </Badge>
                      {cliente.processos_ativos > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {cliente.processos_ativos} processo(s)
                        </Badge>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setViewingCliente(cliente)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Visualizar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenForm(cliente)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => setClienteToDelete(cliente.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{cliente.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    <span>{cliente.telefone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    <span className="truncate">{cliente.endereco}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs">Último contato: {cliente.ultimo_contato ? new Date(cliente.ultimo_contato).toLocaleDateString("pt-BR") : "-"}</span>
                  </div>
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

      {/* Dialog/Sheet para Adicionar/Editar Cliente */}
      {isMobile ? (
        <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
          <SheetContent side="bottom" className="rounded-t-lg">
            <SheetHeader className="text-left">
              <SheetTitle className="text-lg font-semibold">{editingCliente ? "Editar Cliente" : "Novo Cliente"}</SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                {editingCliente ? "Atualize as informações do cliente." : "Preencha os dados para cadastrar um novo cliente."}
              </SheetDescription>
            </SheetHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                {formFields}
                <SheetFooter className="flex flex-col-reverse sm:flex-row gap-2">
                  <SheetClose asChild>
                    <Button type="button" variant="outline" className="w-full text-sm">Cancelar</Button>
                  </SheetClose>
                  <Button type="submit" className="w-full text-sm">{editingCliente ? "Salvar Alterações" : "Cadastrar"}</Button>
                </SheetFooter>
              </form>
            </Form>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="mx-4 max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">{editingCliente ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {editingCliente ? "Atualize as informações do cliente." : "Preencha os dados para cadastrar um novo cliente."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                {formFields}
                <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} className="w-full sm:w-auto text-sm">Cancelar</Button>
                  <Button type="submit" className="w-full sm:w-auto text-sm">{editingCliente ? "Salvar Alterações" : "Cadastrar"}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}
      
      {/* AlertDialog para Excluir Cliente */}
      <AlertDialog open={!!clienteToDelete} onOpenChange={() => setClienteToDelete(null)}>
        <AlertDialogContent className="mx-4 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold">Excluir Cliente</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o cliente e TODOS os dados relacionados, incluindo:
              <br />• Processos vinculados ao cliente
              <br />• Lançamentos financeiros
              <br />• Histórico de audiências relacionadas
              <br /><br />Tem certeza que deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setClienteToDelete(null)} className="w-full sm:w-auto text-sm">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => clienteToDelete && handleDeleteCliente(clienteToDelete)} className="w-full sm:w-auto text-sm">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog/Sheet para Visualizar Cliente */}
      {viewingCliente && (
        isMobile ? (
          <Sheet open={!!viewingCliente} onOpenChange={() => setViewingCliente(null)}>
            <SheetContent side="bottom" className="rounded-t-lg">
              <SheetHeader className="text-left">
                <SheetTitle className="text-lg font-semibold">Detalhes do Cliente</SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground">
                  Informações detalhadas sobre {viewingCliente?.nome}.
                </SheetDescription>
              </SheetHeader>
              {viewContent}
              <SheetFooter>
                <SheetClose asChild>
                  <Button type="button" variant="outline" className="w-full text-sm">Fechar</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={!!viewingCliente} onOpenChange={() => setViewingCliente(null)}>
            <DialogContent className="mx-4 max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">Detalhes do Cliente</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Informações detalhadas sobre {viewingCliente?.nome}.
                </DialogDescription>
              </DialogHeader>
              {viewContent}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="w-full sm:w-auto text-sm">Fechar</Button>
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
