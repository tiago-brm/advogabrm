import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  PlusCircle,
  Search,
  MoreHorizontal,
  Calendar,
  MapPin,
  Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateForDatabase, parseDateFromDatabase } from "@/lib/utils";
import { AudienciaForm } from "@/components/audiencias/AudienciaForm";
import { DeleteAudienciaDialog } from "@/components/audiencias/DeleteAudienciaDialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Audiencia = {
  id: string;
  processoNumero: string;
  data: Date;
  hora: string;
  local: string;
  tipo: "Instrução" | "Conciliação" | "Julgamento" | "Una";
  status: "Agendada" | "Realizada" | "Cancelada" | "Reagendada";
};

const initialAudiencias: Audiencia[] = [];

const getStatusBadgeClass = (status: Audiencia["status"]) => {
  switch (status) {
    case "Agendada":
      return "bg-blue-500/20 text-blue-400 border-blue-500/20";
    case "Realizada":
      return "bg-green-500/20 text-green-400 border-green-500/20";
    case "Cancelada":
      return "bg-red-500/20 text-red-400 border-red-500/20";
    case "Reagendada":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/20";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/20";
  }
};

export default function Audiencias() {
  const [audiencias, setAudiencias] = useState<Audiencia[]>(initialAudiencias);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAudiencia, setEditingAudiencia] = useState<
    Audiencia | undefined
  >(undefined);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingAudienciaId, setDeletingAudienciaId] = useState<string | null>(
    null
  );

  const { user } = useAuth();

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("audiencias")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error(error);
        toast.error("Erro ao carregar audiências");
        return;
      }
      setAudiencias(
        (data || []).map((a: any) => ({
          id: a.id,
          processoNumero: a.processo_numero,
          data: new Date(a.data + "T00:00:00"),
          hora: a.hora,
          local: a.local,
          tipo: a.tipo,
          status: a.status,
        }))
      );
    };
    load();
  }, []);

  const filteredAudiencias = useMemo(() => {
    return audiencias.filter(
      (a) =>
        a.processoNumero.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.local.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [audiencias, searchTerm]);

  const handleSave = async (
    audienciaData: Omit<Audiencia, "id"> & { id?: string }
  ) => {
    try {
      if (audienciaData.id) {
        const { error } = await supabase
          .from("audiencias")
          .update({
            processo_numero: audienciaData.processoNumero,
            data:
              typeof audienciaData.data === "string"
                ? audienciaData.data
                : formatDateForDatabase(audienciaData.data),
            hora: audienciaData.hora,
            local: audienciaData.local,
            tipo: audienciaData.tipo,
            status: audienciaData.status,
          })
          .eq("id", audienciaData.id);
        if (error) throw error;
        setAudiencias((prev) =>
          prev.map((a) =>
            a.id === audienciaData.id
              ? { id: audienciaData.id!, ...audienciaData }
              : a
          )
        );
        toast.success("Audiência atualizada com sucesso!");
      } else {
        const userId = user?.id;
        const { data, error } = await supabase
          .from("audiencias")
          .insert({
            processo_numero: audienciaData.processoNumero,
            data:
              typeof audienciaData.data === "string"
                ? audienciaData.data
                : formatDateForDatabase(audienciaData.data),
            hora: audienciaData.hora,
            local: audienciaData.local,
            tipo: audienciaData.tipo,
            status: audienciaData.status,
            user_id: userId,
          })
          .select("*")
          .single();
        if (error) throw error;
        setAudiencias((prev) => [
          {
            id: (data as any).id,
            processoNumero: (data as any).processo_numero,
            data: new Date((data as any).data + "T00:00:00"),
            hora: (data as any).hora,
            local: (data as any).local,
            tipo: (data as any).tipo,
            status: (data as any).status,
          },
          ...prev,
        ]);
        toast.success("Audiência adicionada com sucesso!");
      }
      setIsFormOpen(false);
      setEditingAudiencia(undefined);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar audiência");
    }
  };

  const handleDelete = async () => {
    if (deletingAudienciaId) {
      const { error } = await supabase
        .from("audiencias")
        .delete()
        .eq("id", deletingAudienciaId);
      if (error) {
        console.error(error);
        toast.error("Erro ao excluir audiência");
        return;
      }
      setAudiencias(audiencias.filter((a) => a.id !== deletingAudienciaId));
      toast.success("Audiência excluída com sucesso!");
      setIsDeleteDialogOpen(false);
      setDeletingAudienciaId(null);
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">
            Gerenciamento de Audiências
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Visualize, adicione e gerencie as audiências.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingAudiencia(undefined);
            setIsFormOpen(true);
          }}
          className="w-full sm:w-auto"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Nova Audiência
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
        <Input
          placeholder="Buscar por nº do processo ou local..."
          className="pl-9 sm:pl-10 text-sm sm:text-base"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Processo</TableHead>
              <TableHead>Data e Hora</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAudiencias.map((audiencia) => (
              <TableRow key={audiencia.id}>
                <TableCell className="font-medium">
                  {audiencia.processoNumero}
                </TableCell>
                <TableCell>
                  {format(audiencia.data, "dd/MM/yyyy", { locale: ptBR })} às{" "}
                  {audiencia.hora}
                </TableCell>
                <TableCell>{audiencia.local}</TableCell>
                <TableCell>{audiencia.tipo}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "pointer-events-none",
                      getStatusBadgeClass(audiencia.status)
                    )}
                  >
                    {audiencia.status}
                  </Badge>
                </TableCell>
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
                        onClick={() => {
                          setEditingAudiencia(audiencia);
                          setIsFormOpen(true);
                        }}
                      >
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-500 hover:!text-red-500"
                        onClick={() => {
                          setDeletingAudienciaId(audiencia.id);
                          setIsDeleteDialogOpen(true);
                        }}
                      >
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
      <div className="md:hidden space-y-3">
        {filteredAudiencias.map((audiencia) => (
          <Card key={audiencia.id} className="p-3">
            <CardHeader className="p-0 pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm">
                    Processo {audiencia.processoNumero}
                  </h3>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      getStatusBadgeClass(audiencia.status)
                    )}
                  >
                    {audiencia.status}
                  </Badge>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Abrir menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingAudiencia(audiencia);
                        setIsFormOpen(true);
                      }}
                    >
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-500 hover:!text-red-500"
                      onClick={() => {
                        setDeletingAudienciaId(audiencia.id);
                        setIsDeleteDialogOpen(true);
                      }}
                    >
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {format(audiencia.data, "dd/MM/yyyy", { locale: ptBR })}
                </span>
                <Clock className="h-4 w-4 ml-2" />
                <span>{audiencia.hora}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{audiencia.local}</span>
              </div>
              <div className="text-sm">
                <span className="font-medium">Tipo:</span> {audiencia.tipo}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AudienciaForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingAudiencia(undefined);
        }}
        onSave={handleSave}
        audiencia={editingAudiencia}
      />

      <DeleteAudienciaDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
