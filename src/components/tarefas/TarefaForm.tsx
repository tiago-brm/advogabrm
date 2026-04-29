import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateForDatabase, adjustDateForTimezone } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tarefa } from "@/pages/Tarefas";

const formSchema = z.object({
  descricao: z.string().min(1, "A descrição é obrigatória."),
  dataConclusao: z.date({
    required_error: "A data de conclusão é obrigatória.",
  }),
  prioridade: z.enum(["Baixa", "Média", "Alta"], {
    required_error: "A prioridade é obrigatória.",
  }),
  status: z.enum(["Pendente", "Em Andamento", "Concluída"], {
    required_error: "O status é obrigatório.",
  }),
  responsavel: z.string().min(1, "O responsável é obrigatório."),
});

type TarefaFormProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: z.infer<typeof formSchema> & { id?: string }) => void;
  tarefa?: Tarefa;
};

type MembroEquipe = {
  id: string;
  nome: string;
};

export function TarefaForm({
  isOpen,
  onClose,
  onSave,
  tarefa,
}: TarefaFormProps) {
  const [membrosEquipe, setMembrosEquipe] = useState<MembroEquipe[]>([]);
  const { user } = useAuth();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      descricao: "",
      responsavel: "",
    },
  });

  const carregarMembrosEquipe = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('equipe')
        .select('id, nome')
        .eq('user_id', user.id)
        .eq('status', 'Ativo')
        .order('nome');
      
      if (error) {
        console.error('Erro ao carregar membros da equipe:', error);
        return;
      }
      
      setMembrosEquipe(data || []);
    } catch (error) {
      console.error('Erro ao carregar membros da equipe:', error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      carregarMembrosEquipe();
      
      if (tarefa) {
        form.reset(tarefa);
      } else {
        form.reset({
          descricao: "",
          dataConclusao: undefined,
          prioridade: undefined,
          status: "Pendente",
          responsavel: "",
        });
      }
    }
  }, [tarefa, form, isOpen, user]);

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    const tarefaData = {
      ...data,
      dataConclusao: formatDateForDatabase(data.dataConclusao),
      id: tarefa?.id,
    };
    onSave(tarefaData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="mx-4 sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">
            {tarefa ? "Editar Tarefa" : "Nova Tarefa"}
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            Preencha os detalhes abaixo para{" "}
            {tarefa ? "atualizar a" : "adicionar uma nova"} tarefa.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Descrição
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva a tarefa..."
                      className="text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dataConclusao"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-sm font-medium">
                      Data de Conclusão
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "pl-3 text-left font-normal text-sm",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: ptBR })
                            ) : (
                              <span>Escolha uma data</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            if (date) {
                              field.onChange(adjustDateForTimezone(date));
                            }
                          }}
                          locale={ptBR}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="responsavel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Responsável
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Selecione um membro da equipe..." />
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="prioridade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Prioridade
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Baixa">Baixa</SelectItem>
                        <SelectItem value="Média">Média</SelectItem>
                        <SelectItem value="Alta">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Status
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Pendente">Pendente</SelectItem>
                        <SelectItem value="Em Andamento">
                          Em Andamento
                        </SelectItem>
                        <SelectItem value="Concluída">Concluída</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="w-full sm:w-auto order-2 sm:order-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto order-1 sm:order-2"
              >
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
