import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  CheckCircle2,
  Calendar,
  User,
  FileText,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { format, isAfter, isWithinInterval, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateForDatabase } from "@/lib/utils";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  LancamentoForm,
  LancamentoFormValues,
} from "@/components/financeiro/LancamentoForm";
import { DeleteLancamentoDialog } from "@/components/financeiro/DeleteLancamentoDialog";
import { StatusUpdateDialog } from "@/components/financeiro/StatusUpdateDialog";

type Lancamento = {
  id: string;
  descricao: string;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string | null;
  status: "Pago" | "Pendente";
  clienteId: string;
  clienteNome: string;
};

type ClienteLite = { id: string; nome: string };

const Financeiro = () => {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLancamento, setEditingLancamento] = useState<Lancamento | null>(
    null
  );
  const [lancamentoToDelete, setLancamentoToDelete] = useState<string | null>(
    null
  );
  const [statusUpdateTarget, setStatusUpdateTarget] =
    useState<Lancamento | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const getStatus = (lancamento: Lancamento) => {
    if (lancamento.status === "Pago") {
      return { text: "Pago", variant: "success" as const };
    }
    if (
      isAfter(new Date(), new Date(lancamento.dataVencimento + "T00:00:00"))
    ) {
      return { text: "Atrasado", variant: "destructive" as const };
    }
    return { text: "Pendente", variant: "warning" as const };
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [clientesRes, lancRes] = await Promise.all([
          supabase.from("clientes").select("id, nome").order("nome"),
          supabase
            .from("financeiro_lancamentos")
            .select("*")
            .order("created_at", { ascending: false }),
        ]);

        if (clientesRes.error) console.error(clientesRes.error);
        if (lancRes.error) throw lancRes.error;

        const clientesData = (clientesRes.data || []) as {
          id: string;
          nome: string;
        }[];
        setClientes(clientesData);

        setLancamentos(
          (lancRes.data || []).map((l: any) => ({
            id: l.id,
            descricao: l.descricao,
            valor: Number(l.valor),
            dataVencimento: l.data_vencimento,
            dataPagamento: l.data_pagamento,
            status: l.status,
            clienteId: l.cliente_id,
            clienteNome:
              clientesData.find((c) => c.id === l.cliente_id)?.nome || "-",
          }))
        );
      } catch (e) {
        console.error(e);
        toast({
          title: "Erro",
          description: "Erro ao carregar lançamentos",
          variant: "destructive",
        });
      }
    };
    load();
  }, []);

  const handleOpenForm = (lancamento?: Lancamento) => {
    setEditingLancamento(lancamento || null);
    setIsFormOpen(true);
  };

  const onSubmit = async (data: LancamentoFormValues) => {
    const selectedCliente = clientes.find((c) => c.id === data.clienteId);
    if (!selectedCliente || !user?.id) {
      toast({
        title: "Erro",
        description: "Usuário não autenticado ou cliente inválido",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingLancamento) {
        const { error } = await supabase
          .from("financeiro_lancamentos")
          .update({
            descricao: data.descricao,
            valor: data.valor,
            data_vencimento: formatDateForDatabase(data.dataVencimento),
            cliente_id: data.clienteId,
          })
          .eq("id", editingLancamento.id);
        if (error) throw error;

        setLancamentos(
          lancamentos.map((l) =>
            l.id === editingLancamento.id
              ? {
                  ...l,
                  descricao: data.descricao,
                  valor: data.valor,
                  dataVencimento: formatDateForDatabase(data.dataVencimento),
                  clienteId: selectedCliente.id,
                  clienteNome: selectedCliente.nome,
                }
              : l
          )
        );
        toast({ title: "Sucesso!", description: "Lançamento atualizado." });
      } else {
        const { data: inserted, error } = await supabase
          .from("financeiro_lancamentos")
          .insert({
            descricao: data.descricao,
            valor: data.valor,
            data_vencimento: formatDateForDatabase(data.dataVencimento),
            status: "Pendente",
            cliente_id: data.clienteId,
            user_id: user.id,
          })
          .select("*")
          .single();
        if (error) throw error;

        setLancamentos([
          {
            id: inserted!.id,
            descricao: inserted!.descricao,
            valor: Number(inserted!.valor),
            dataVencimento: inserted!.data_vencimento,
            dataPagamento: inserted!.data_pagamento,
            status: inserted!.status,
            clienteId: inserted!.cliente_id,
            clienteNome: selectedCliente.nome,
          },
          ...lancamentos,
        ]);
        toast({
          title: "Sucesso!",
          description: "Novo lançamento adicionado.",
        });
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro",
        description: "Falha ao salvar lançamento",
        variant: "destructive",
      });
    }

    setIsFormOpen(false);
  };

  const handleDelete = async () => {
    if (!lancamentoToDelete) return;
    try {
      const { error } = await supabase
        .from("financeiro_lancamentos")
        .delete()
        .eq("id", lancamentoToDelete);
      if (error) throw error;
      setLancamentos(lancamentos.filter((l) => l.id !== lancamentoToDelete));
      toast({ title: "Lançamento excluído", variant: "destructive" });
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro",
        description: "Falha ao excluir lançamento",
        variant: "destructive",
      });
    } finally {
      setLancamentoToDelete(null);
    }
  };

  const handleUpdateStatus = async (newStatus: "Pago" | "Pendente") => {
    if (!statusUpdateTarget) return;
    try {
      const payload: any = { status: newStatus };
      if (newStatus === "Pago") {
        payload.data_pagamento = formatDateForDatabase(new Date());
      } else {
        payload.data_pagamento = null;
      }
      const { error } = await supabase
        .from("financeiro_lancamentos")
        .update(payload)
        .eq("id", statusUpdateTarget.id);
      if (error) throw error;

      setLancamentos(
        lancamentos.map((l) =>
          l.id === statusUpdateTarget.id
            ? {
                ...l,
                status: newStatus,
                dataPagamento:
                  newStatus === "Pago"
                    ? formatDateForDatabase(new Date())
                    : null,
              }
            : l
        )
      );
      toast({
        title: "Sucesso!",
        description: "Status do lançamento atualizado.",
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro",
        description: "Falha ao atualizar status",
        variant: "destructive",
      });
    } finally {
      setStatusUpdateTarget(null);
    }
  };

  const filteredLancamentos = lancamentos.filter(
    (l) =>
      l.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.clienteNome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalAReceber = lancamentos
    .filter((l) => getStatus(l).text !== "Pago")
    .reduce((sum, l) => sum + l.valor, 0);

  const recebido30dias = lancamentos
    .filter(
      (l) =>
        l.status === "Pago" &&
        l.dataPagamento &&
        isWithinInterval(new Date(l.dataPagamento + "T00:00:00"), {
          start: subDays(new Date(), 30),
          end: new Date(),
        })
    )
    .reduce((sum, l) => sum + l.valor, 0);

  const atrasadosCount = lancamentos.filter(
    (l) => getStatus(l).text === "Atrasado"
  ).length;

  const stats = [
    {
      title: "Total a Receber",
      value: `R$ ${totalAReceber.toFixed(2)}`,
      icon: DollarSign,
      color: "text-orange-500",
    },
    {
      title: "Recebido (30d)",
      value: `R$ ${recebido30dias.toFixed(2)}`,
      icon: TrendingUp,
      color: "text-green-500",
    },
    {
      title: "Lançamentos Atrasados",
      value: atrasadosCount,
      icon: AlertCircle,
      color: "text-red-500",
    },
  ];

  const getStatusBadge = (variant: "success" | "warning" | "destructive") => {
    switch (variant) {
      case "success":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "warning":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "destructive":
        return "bg-red-500/10 text-red-500 border-red-500/20";
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Gestão Financeira</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Acompanhe os recebimentos do seu escritório.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon
                className={`h-4 w-4 text-muted-foreground ${stat.color}`}
              />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição ou cliente..."
                className="pl-10 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button onClick={() => handleOpenForm()} className="w-full sm:w-auto text-sm">
              <Plus className="mr-2 h-4 w-4" /> Adicionar Lançamento
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px] text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLancamentos.map((lancamento) => {
                  const statusInfo = getStatus(lancamento);
                  return (
                    <TableRow key={lancamento.id}>
                      <TableCell className="font-medium">
                        {lancamento.descricao}
                      </TableCell>
                      <TableCell>{lancamento.clienteNome}</TableCell>
                      <TableCell className="text-right">
                        R$ {lancamento.valor.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {format(
                          new Date(lancamento.dataVencimento + "T00:00:00"),
                          "dd/MM/yyyy",
                          { locale: ptBR }
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`${getStatusBadge(
                            statusInfo.variant
                          )} cursor-pointer`}
                          onClick={() => setStatusUpdateTarget(lancamento)}
                        >
                          {statusInfo.text}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Abrir menu</span>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setStatusUpdateTarget(lancamento)}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              <span>Alterar status</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleOpenForm(lancamento)}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              <span>Editar</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-500"
                              onClick={() => setLancamentoToDelete(lancamento.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Excluir</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {filteredLancamentos.map((lancamento) => {
              const statusInfo = getStatus(lancamento);
              return (
                <Card key={lancamento.id} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <h3 className="font-medium text-sm leading-tight">
                            {lancamento.descricao}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>{lancamento.clienteNome}</span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setStatusUpdateTarget(lancamento)}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            <span>Alterar status</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleOpenForm(lancamento)}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            <span>Editar</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500"
                            onClick={() => setLancamentoToDelete(lancamento.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Excluir</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-3 w-3 text-green-600" />
                        <span className="font-medium text-green-600">
                          R$ {lancamento.valor.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {format(
                            new Date(lancamento.dataVencimento + "T00:00:00"),
                            "dd/MM/yyyy",
                            { locale: ptBR }
                          )}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex justify-start">
                      <Badge
                        className={`${getStatusBadge(
                          statusInfo.variant
                        )} cursor-pointer text-xs`}
                        onClick={() => setStatusUpdateTarget(lancamento)}
                      >
                        {statusInfo.text}
                      </Badge>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="mx-4 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">
              {editingLancamento ? "Editar" : "Adicionar"} Lançamento
            </DialogTitle>
          </DialogHeader>
          <LancamentoForm
            onSubmit={onSubmit}
            lancamento={editingLancamento}
            clientes={clientes}
          />
        </DialogContent>
      </Dialog>

      <DeleteLancamentoDialog
        open={!!lancamentoToDelete}
        onOpenChange={(open) => !open && setLancamentoToDelete(null)}
        onConfirm={handleDelete}
      />

      <StatusUpdateDialog
        open={!!statusUpdateTarget}
        onOpenChange={(open) => !open && setStatusUpdateTarget(null)}
        onConfirm={handleUpdateStatus}
        currentStatus={
          statusUpdateTarget
            ? (getStatus(statusUpdateTarget).text as
                | "Pago"
                | "Pendente"
                | "Atrasado")
            : "Pendente"
        }
      />
    </div>
  );
};

export default Financeiro;
