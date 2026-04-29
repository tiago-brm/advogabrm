import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  Clock,
  MapPin,
  Briefcase,
  CheckCircle,
  AlertCircle,
  Calendar as CalendarIcon,
} from "lucide-react";
import { format, isToday, isTomorrow, isThisWeek, parseISO, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type AgendaItem = {
  id: string;
  type: 'audiencia' | 'tarefa';
  title: string;
  description?: string;
  date: Date;
  time?: string;
  location?: string;
  status: string;
  priority?: string;
  cliente?: string;
  processo?: string;
};

const Agenda = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);


  // Carregar dados da agenda
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user?.id);
      console.log('User from context:', user);
    };
    checkUser();
    if (user) {
      loadAgendaData();
    }
  }, [user]);

  const loadAgendaData = async () => {
    try {
      setLoading(true);
      console.log('Iniciando busca com user_id:', user?.id);
      
      // Carregar audiências
      const { data: audiencias, error: audienciasError } = await supabase
        .from('audiencias')
        .select('*')
        .eq('user_id', user?.id);

      console.log('Audiências query result:', { audiencias, audienciasError });
      
      if (audienciasError) {
        console.error('Erro ao buscar audiências:', audienciasError);
        throw audienciasError;
      }

      // Carregar tarefas
      const { data: tarefas, error: tarefasError } = await supabase
        .from('tarefas')
        .select('*')
        .eq('user_id', user?.id);

      console.log('Tarefas query result:', { tarefas, tarefasError });
      
      if (tarefasError) {
        console.error('Erro ao buscar tarefas:', tarefasError);
        throw tarefasError;
      }

      // Converter audiências para AgendaItem
      const audienciasItems: AgendaItem[] = (audiencias || []).map(audiencia => ({
        id: audiencia.id,
        type: 'audiencia',
        title: `Audiência - ${audiencia.tipo}`,
        description: audiencia.processo_numero,
        date: new Date(audiencia.data + 'T00:00:00'),
        time: audiencia.hora,
        location: audiencia.local,
        status: audiencia.status,
        processo: audiencia.processo_numero,
      }));

      // Converter tarefas para AgendaItem
      const tarefasItems: AgendaItem[] = (tarefas || []).map(tarefa => ({
        id: tarefa.id,
        type: 'tarefa',
        title: tarefa.descricao,
        description: tarefa.responsavel,
        date: new Date(tarefa.data_conclusao + 'T00:00:00'),
        status: tarefa.status,
        priority: tarefa.prioridade,
      }));

      const allItems = [...audienciasItems, ...tarefasItems];
      console.log('Dados carregados:', {
        audiencias: audiencias?.length || 0,
        tarefas: tarefas?.length || 0,
        audienciasItems: audienciasItems.length,
        tarefasItems: tarefasItems.length,
        allItems: allItems.length,
        sampleItems: allItems.slice(0, 3)
      });
      setAgendaItems(allItems);
    } catch (error) {
      console.error('Erro ao carregar agenda:', error);
      toast.error('Erro ao carregar dados da agenda');
    } finally {
      setLoading(false);
    }
  };

  // Usar todos os itens da agenda
  const filteredItems = agendaItems;

  // Itens do dia selecionado
  const selectedDateItems = filteredItems.filter(item => {
    const itemDateStr = format(item.date, 'yyyy-MM-dd');
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
    const matches = itemDateStr === selectedDateStr;
    
    if (selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')) {
      console.log('Filtrando itens para hoje:', {
        selectedDate: selectedDateStr,
        totalFilteredItems: filteredItems.length,
        itemsForToday: filteredItems.filter(item => format(item.date, 'yyyy-MM-dd') === selectedDateStr),
        allItemDates: filteredItems.map(item => format(item.date, 'yyyy-MM-dd'))
      });
    }
    
    return matches;
  });
  
  console.log('Selected date items:', {
    selectedDate: format(selectedDate, 'yyyy-MM-dd'),
    count: selectedDateItems.length,
    items: selectedDateItems
  });

  // Próximos compromissos (próximos 7 dias)
  const upcomingItems = filteredItems
    .filter(item => {
      const today = startOfDay(new Date());
      const itemDate = startOfDay(item.date);
      const weekFromNow = endOfDay(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      return itemDate >= today && itemDate <= weekFromNow;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5);

  const getStatusColor = (status: string, type: string) => {
    if (type === 'audiencia') {
      switch (status) {
        case 'Agendada': return 'bg-blue-100 text-blue-800';
        case 'Realizada': return 'bg-green-100 text-green-800';
        case 'Cancelada': return 'bg-red-100 text-red-800';
        case 'Reagendada': return 'bg-yellow-100 text-yellow-800';
        default: return 'bg-gray-100 text-gray-800';
      }
    } else {
      switch (status) {
        case 'Pendente': return 'bg-yellow-100 text-yellow-800';
        case 'Em Andamento': return 'bg-blue-100 text-blue-800';
        case 'Concluída': return 'bg-green-100 text-green-800';
        default: return 'bg-gray-100 text-gray-800';
      }
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Alta': return 'bg-red-100 text-red-800';
      case 'Média': return 'bg-yellow-100 text-yellow-800';
      case 'Baixa': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getDateLabel = (date: Date) => {
    if (isToday(date)) return 'Hoje';
    if (isTomorrow(date)) return 'Amanhã';
    if (isThisWeek(date)) return format(date, 'EEEE', { locale: ptBR });
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
            <div className="space-y-4">
              <div className="h-32 bg-gray-200 rounded"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="w-6 h-6" />
            Agenda Jurídica
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Gerencie seus compromissos, audiências e tarefas.
          </p>
        </div>
      </div>



      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calendário Principal */}
        <div>
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                Calendário
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                locale={ptBR}
                className="w-full mx-auto scale-110"
                classNames={{
                  months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                  month: "space-y-4 w-full",
                  caption: "flex justify-center pt-1 relative items-center",
                  caption_label: "text-lg font-medium",
                  nav: "space-x-1 flex items-center",
                  nav_button: "h-8 w-8 bg-transparent p-0 opacity-50 hover:opacity-100",
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                  table: "w-full border-collapse space-y-1",
                  head_row: "flex w-full",
                  head_cell: "text-muted-foreground rounded-md w-12 font-normal text-sm flex-1 text-center",
                  row: "flex w-full mt-2",
                  cell: "h-12 w-12 text-center text-sm p-0 relative flex-1 [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                  day: "h-12 w-12 p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                  day_range_end: "day-range-end",
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                  day_today: "bg-accent text-accent-foreground font-semibold",
                  day_outside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
                  day_disabled: "text-muted-foreground opacity-50",
                  day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                  day_hidden: "invisible",
                }}
                modifiers={{
                  hasEvents: agendaItems.map(item => item.date)
                }}
                modifiersClassNames={{
                  hasEvents: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-blue-500 after:rounded-full"
                }}
              />
            </CardContent>
          </Card>
        </div>

        {/* Detalhes dos Compromissos */}
        <div>
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Compromissos de {format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDateItems.length === 0 ? (
                <div className="text-center py-12">
                  <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Nenhum compromisso para este dia.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Clique em outro dia no calendário para ver os compromissos.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {selectedDateItems.map((item) => (
                    <div key={item.id} className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {item.type === 'audiencia' ? (
                            <Briefcase className="w-5 h-5 text-blue-600" />
                          ) : (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          )}
                          <h4 className="font-semibold text-lg">{item.title}</h4>
                        </div>
                        <Badge className={getStatusColor(item.status, item.type)}>
                          {item.status}
                        </Badge>
                      </div>
                      
                      {item.description && (
                        <p className="text-muted-foreground mb-3 text-sm">{item.description}</p>
                      )}
                      
                      <div className="flex flex-wrap gap-3 text-sm">
                        {item.time && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            {item.time}
                          </span>
                        )}
                        {item.location && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="w-4 h-4" />
                            {item.location}
                          </span>
                        )}
                        {item.priority && (
                          <Badge className={getPriorityColor(item.priority)} variant="outline">
                            Prioridade {item.priority}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resumo Rápido */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Resumo Geral</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {agendaItems.filter(item => item.type === 'audiencia').length}
                  </div>
                  <div className="text-sm text-blue-600">Audiências</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {agendaItems.filter(item => item.type === 'tarefa').length}
                  </div>
                  <div className="text-sm text-green-600">Tarefas</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {agendaItems.filter(item => 
                      item.status === 'Pendente' || item.status === 'Agendada'
                    ).length}
                  </div>
                  <div className="text-sm text-yellow-600">Pendentes</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">
                    {agendaItems.length}
                  </div>
                  <div className="text-sm text-gray-600">Total</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Agenda;