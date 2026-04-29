import React, { useState, useMemo, useEffect } from "react";
import {
  PlusCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  Calendar,
  User,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { TarefaForm } from "@/components/tarefas/TarefaForm";
import { DeleteTarefaDialog } from "@/components/tarefas/DeleteTarefaDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateForDatabase, parseDateFromDatabase } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Tarefa = {
  id: string;
  descricao: string;
  dataConclusao: Date;
  prioridade: "Baixa" | "Média" | "Alta";
  status: "Pendente" | "Em Andamento" | "Concluída";
  responsavel: string;
};

const initialTarefas: Tarefa[] = [];

const priorityColors: Record<Tarefa["prioridade"], string> = {
  Alta: "bg-red-500 hover:bg-red-500/90",
  Média: "bg-yellow-500 hover:bg-yellow-500/90",
  Baixa: "bg-blue-500 hover:bg-blue-500/90",
};

const statusColors: Record<Tarefa["status"], string> = {
  Pendente: "bg-gray-500 hover:bg-gray-500/90",
  "Em Andamento": "bg-orange-500 hover:bg-orange-500/90",
  Concluída: "bg-green-500 hover:bg-green-500/90",
};

const Tarefas = () => {
  const [tarefas, setTarefas] = useState<Tarefa[]>(initialTarefas);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | undefined>(
    undefined
  );
  const [tarefaToDelete, setTarefaToDelete] = useState<Tarefa | undefined>(
    undefined
  );
  const [searchTerm, setSearchTerm] = useState("");

  const { user } = useAuth();

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error(error);
        toast.error("Erro ao carregar tarefas");
        return;
      }
      setTarefas(
        (data || []).map((t: any) => ({
          id: t.id,
          descricao: t.descricao,
          dataConclusao: new Date(t.data_conclusao + "T00:00:00"),
          prioridade: t.prioridade as Tarefa["prioridade"],
          status: t.status as Tarefa["status"],
          responsavel: t.responsavel,
        }))
      );
    };
    load();
  }, []);

  const filteredTarefas = useMemo(() => {
    return tarefas.filter(
      (tarefa) =>
        tarefa.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tarefa.responsavel.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [tarefas, searchTerm]);

  const handleAddClick = () => {
    setSelectedTarefa(undefined);
    setIsFormOpen(true);
  };

  const handleEditClick = (tarefa: Tarefa) => {
    setSelectedTarefa(tarefa);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (tarefa: Tarefa) => {
    setTarefaToDelete(tarefa);
    setIsDeleteDialogOpen(true);
  };

  const handleSaveTarefa = async (
    data: Omit<Tarefa, "id"> & { id?: string }
  ) => {
    if (!user) {
      toast.error("É necessário estar logado.");
      return;
    }
    try {
      if (data.id) {
        const { error } = await supabase
          .from("tarefas")
          .update({
            descricao: data.descricao,
            data_conclusao:
              typeof data.dataConclusao === "string"
                ? data.dataConclusao
                : formatDateForDatabase(data.dataConclusao),
            prioridade: data.prioridade,
            status: data.status,
            responsavel: data.responsavel,
          })
          .eq("id", data.id);
        if (error) throw error;
        setTarefas((prev) =>
          prev.map((t) => (t.id === data.id ? { id: data.id!, ...data } : t))
        );
        toast.success("Tarefa atualizada com sucesso!");
      } else {
        const { data: inserted, error } = await supabase
          .from("tarefas")
          .insert([
            {
              descricao: data.descricao,
              data_conclusao:
                typeof data.dataConclusao === "string"
                  ? data.dataConclusao
                  : formatDateForDatabase(data.dataConclusao),
              prioridade: data.prioridade,
              status: data.status,
              responsavel: data.responsavel,
              user_id: user.id,
            },
          ])
          .select()
          .single();
        if (error) throw error;
        setTarefas((prev) => [
          {
            id: inserted!.id,
            descricao: inserted!.descricao,
            dataConclusao: new Date(inserted!.data_conclusao + "T00:00:00"),
            prioridade: inserted!.prioridade,
            status: inserted!.status,
            responsavel: inserted!.responsavel,
          },
          ...prev,
        ]);
        toast.success("Tarefa criada com sucesso!");
      }
      setIsFormOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar tarefa");
    }
  };

  const confirmDelete = async () => {
    if (tarefaToDelete) {
      const { error } = await supabase
        .from("tarefas")
        .delete()
        .eq("id", tarefaToDelete.id);
      if (error) {
        console.error(error);
        toast.error("Erro ao excluir tarefa");
        return;
      }
      setTarefas(tarefas.filter((t) => t.id !== tarefaToDelete.id));
      toast.success("Tarefa excluída com sucesso!");
      setIsDeleteDialogOpen(false);
      setTarefaToDelete(undefined);
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">
            Gerenciamento de Tarefas
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Adicione, edite e acompanhe todas as tarefas do escritório.
          </p>
        </div>
        <Button onClick={handleAddClick} className="w-full sm:w-auto">
          <PlusCircle className="mr-2 h-4 w-4" />
          Nova Tarefa
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <Input
          placeholder="Pesquisar por descrição ou responsável..."
          className="flex-1 text-sm sm:text-base px-3 py-2"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button
          variant="outline"
          onClick={() => setSearchTerm("")}
          className="w-full sm:w-auto text-sm"
        >
          Limpar Filtro
        </Button>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Data de Conclusão</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="w-[64px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTarefas.length > 0 ? (
              filteredTarefas.map((tarefa) => (
                <TableRow key={tarefa.id}>
                  <TableCell className="font-medium max-w-xs truncate">
                    {tarefa.descricao}
                  </TableCell>
                  <TableCell>
                    {format(tarefa.dataConclusao, "PPP", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`${
                        priorityColors[tarefa.prioridade]
                      } text-white`}
                    >
                      {tarefa.prioridade}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`${statusColors[tarefa.status]} text-white`}
                    >
                      {tarefa.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{tarefa.responsavel}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleEditClick(tarefa)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          <span>Editar</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(tarefa)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>Excluir</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24">
                  Nenhuma tarefa encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredTarefas.length > 0 ? (
          filteredTarefas.map((tarefa) => (
            <Card key={tarefa.id} className="p-3">
              <CardHeader className="p-0 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm leading-tight truncate">
                      {tarefa.descricao}
                    </h3>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 flex-shrink-0"
                      >
                        <span className="sr-only">Abrir menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditClick(tarefa)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        <span>Editar</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteClick(tarefa)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>Excluir</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="p-0 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {format(tarefa.dataConclusao, "PPP", { locale: ptBR })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>{tarefa.responsavel}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Badge
                    className={`${
                      priorityColors[tarefa.prioridade]
                    } text-white text-xs px-2 py-1`}
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {tarefa.prioridade}
                  </Badge>
                  <Badge
                    className={`${
                      statusColors[tarefa.status]
                    } text-white text-xs px-2 py-1`}
                  >
                    {tarefa.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="p-6">
            <div className="text-center text-muted-foreground">
              Nenhuma tarefa encontrada.
            </div>
          </Card>
        )}
      </div>

      <TarefaForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSaveTarefa}
        tarefa={selectedTarefa}
      />

      <DeleteTarefaDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default Tarefas;
