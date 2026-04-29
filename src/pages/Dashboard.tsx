import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Briefcase,
  Calendar,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  DollarSign,
  FileText,
  Target
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const Dashboard = () => {
  const [totalClientes, setTotalClientes] = useState(0);
  const [totalProcessos, setTotalProcessos] = useState(0);
  const [audienciasHoje, setAudienciasHoje] = useState(0);
  const [receitaMensal, setReceitaMensal] = useState(0);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);

  const [processos, setProcessos] = useState<Array<{ id: string; numero: string; cliente: string; status: string; prazo: string | null }>>([]);
  const [proximasAudiencias, setProximasAudiencias] = useState<Array<{ id: string; processo: string; cliente: string; data: string; hora: string; tipo: string }>>([]);

  const [resumoFinanceiro, setResumoFinanceiro] = useState({ receitaTotal: 0, pendentes: 0, despesasMes: 0 });
  const [produtividade, setProdutividade] = useState({ procConcl: 0, audReal: 0, tarefasMes: 0 });
  const [statsMes, setStatsMes] = useState({ ganhos: 0, andamento: 0, novos: 0 });

  const currency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  useEffect(() => {
    const load = async () => {
      try {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const first = format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const last = format(endOfMonth(new Date()), 'yyyy-MM-dd');

        // Counts
        const [{ count: clientesCount }, { count: processosCount }, { count: audCount }] = await Promise.all([
          supabase.from('clientes').select('*', { count: 'exact', head: true }),
          supabase.from('processos').select('*', { count: 'exact', head: true }),
          supabase.from('audiencias').select('*', { count: 'exact', head: true }).eq('data', todayStr),
        ]);
        setTotalClientes(clientesCount || 0);
        setTotalProcessos(processosCount || 0);
        setAudienciasHoje(audCount || 0);

        // Financeiro
        const [{ data: pagosMes }, { data: pagosAll }, { data: pendentes }] = await Promise.all([
          supabase.from('financeiro_lancamentos').select('valor, data_pagamento, status').eq('status', 'Pago').gte('data_pagamento', first).lte('data_pagamento', last),
          supabase.from('financeiro_lancamentos').select('valor, status').eq('status', 'Pago'),
          supabase.from('financeiro_lancamentos').select('valor, status').eq('status', 'Pendente'),
        ]);
        const receitaMes = (pagosMes || []).reduce((acc: number, l: any) => acc + Number(l.valor || 0), 0);
        const receitaTotal = (pagosAll || []).reduce((acc: number, l: any) => acc + Number(l.valor || 0), 0);
        const pend = (pendentes || []).reduce((acc: number, l: any) => acc + Number(l.valor || 0), 0);
        setReceitaMensal(receitaMes);
        setResumoFinanceiro({ receitaTotal, pendentes: pend, despesasMes: 0 });

        // Processos recentes (com nome do cliente)
        const { data: procs } = await supabase
          .from('processos')
          .select('id, numero, cliente_id, status, data_limite, created_at')
          .order('created_at', { ascending: false })
          .limit(4);

        const ids = Array.from(new Set((procs || []).map((p: any) => p.cliente_id).filter(Boolean)));
        let clientesMap: Record<string, string> = {};
        if (ids.length > 0) {
          const { data: cls } = await supabase.from('clientes').select('id, nome').in('id', ids);
          (cls || []).forEach((c: any) => (clientesMap[c.id] = c.nome));
        }
        setProcessos(
          (procs || []).map((p: any) => ({
            id: p.id,
            numero: p.numero,
            cliente: clientesMap[p.cliente_id] || '',
            status: p.status,
            prazo: p.data_limite ? format(new Date(p.data_limite + 'T00:00:00'), 'dd/MM/yyyy') : '-'
          }))
        );

        // Próximas audiências
        const { data: auds } = await supabase
          .from('audiencias')
          .select('id, processo_numero, data, hora, tipo, local')
          .gte('data', todayStr)
          .order('data', { ascending: true })
          .limit(3);
        setProximasAudiencias(
          (auds || []).map((a: any) => ({
            id: a.id,
            processo: a.processo_numero,
            cliente: a.local || '',
            data: a.data ? format(new Date(a.data + 'T00:00:00'), 'dd/MM/yyyy') : '',
            hora: (a.hora || '').toString().slice(0, 5),
            tipo: a.tipo
          }))
        );

        // Produtividade e Estatísticas do Mês
        const [
          { count: conclAll },
          { count: audMesTotal },
          { count: audMesReal },
          { count: tarefasMesTotal },
          { count: tarefasMesConcl },
          { count: conclMes },
          { count: andamentoAll },
          { count: novosMes },
        ] = await Promise.all([
          supabase.from('processos').select('*', { count: 'exact', head: true }).eq('status', 'Concluído'),
          supabase.from('audiencias').select('*', { count: 'exact', head: true }).gte('data', first).lte('data', last),
          supabase.from('audiencias').select('*', { count: 'exact', head: true }).gte('data', first).lte('data', last).eq('status', 'Realizada'),
          supabase.from('tarefas').select('*', { count: 'exact', head: true }).gte('created_at', first).lte('created_at', last),
          supabase.from('tarefas').select('*', { count: 'exact', head: true }).gte('created_at', first).lte('created_at', last).eq('status', 'Concluída'),
          supabase.from('processos').select('*', { count: 'exact', head: true }).eq('status', 'Concluído').gte('created_at', first).lte('created_at', last),
          supabase.from('processos').select('*', { count: 'exact', head: true }).eq('status', 'Em Andamento'),
          supabase.from('processos').select('*', { count: 'exact', head: true }).gte('created_at', first).lte('created_at', last),
        ]);

        const procConclPerc = (processosCount || 0) > 0 ? Math.round(((conclAll || 0) * 100) / (processosCount || 1)) : 0;
        const audRealPerc = (audMesTotal || 0) > 0 ? Math.round(((audMesReal || 0) * 100) / (audMesTotal || 1)) : 0;
        const tarefasPerc = (tarefasMesTotal || 0) > 0 ? Math.round(((tarefasMesConcl || 0) * 100) / (tarefasMesTotal || 1)) : 0;
        setProdutividade({ procConcl: procConclPerc, audReal: audRealPerc, tarefasMes: tarefasPerc });
        setStatsMes({ ganhos: conclMes || 0, andamento: andamentoAll || 0, novos: novosMes || 0 });
        
        // Atualizar timestamp da última atualização
        setUltimaAtualizacao(new Date());
      } catch (e) {
        console.error('Erro ao carregar dashboard:', e);
      }
    };
    load();
  }, []);

  const metrics = useMemo(() => [
    { title: 'Total de Clientes', value: String(totalClientes), change: '—', icon: Users, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
    { title: 'Processos Ativos', value: String(totalProcessos), change: '—', icon: Briefcase, color: 'text-green-500', bgColor: 'bg-green-500/10' },
    { title: 'Audiências Hoje', value: String(audienciasHoje), change: '—', icon: Calendar, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
    { title: 'Receita Mensal', value: currency(receitaMensal), change: '—', icon: DollarSign, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  ], [totalClientes, totalProcessos, audienciasHoje, receitaMensal]);

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

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do seu escritório de advocacia</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Última atualização</p>
          <p className="text-sm font-medium">
            {ultimaAtualizacao 
              ? format(ultimaAtualizacao, "'Hoje', HH:mm", { locale: ptBR })
              : "Carregando..."
            }
          </p>
        </div>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => (
          <Card key={index} className="gradient-card hover:shadow-lg transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{metric.title}</p>
                  <p className="text-2xl font-bold">{metric.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="text-green-500">{metric.change}</span> vs mês anterior
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${metric.bgColor}`}>
                  <metric.icon className={`w-6 h-6 ${metric.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Processos Recentes */}
        <Card className="lg:col-span-2 gradient-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Processos Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {processos.map((processo) => (
                <div key={processo.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <p className="font-medium">{processo.numero}</p>
                    <p className="text-sm text-muted-foreground">{processo.cliente}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`status-badge ${getStatusBadge(processo.status)}`}>
                      {processo.status}
                    </span>
                    <p className="text-sm text-muted-foreground">{processo.prazo}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Próximas Audiências */}
        <Card className="gradient-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Próximas Audiências
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {proximasAudiencias.map((audiencia) => (
                <div key={audiencia.id} className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{audiencia.cliente}</p>
                    <span className="text-xs text-muted-foreground">{audiencia.tipo}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{audiencia.processo}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <Clock className="w-3 h-3" />
                    <span>{audiencia.data} às {audiencia.hora}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Estatísticas adicionais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="gradient-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Produtividade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Processos Concluídos</span>
                  <span>{produtividade.procConcl}%</span>
                </div>
                <Progress value={produtividade.procConcl} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Audiências Realizadas</span>
                  <span>{produtividade.audReal}%</span>
                </div>
                <Progress value={produtividade.audReal} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Tarefas do Mês</span>
                  <span>{produtividade.tarefasMes}%</span>
                </div>
                <Progress value={produtividade.tarefasMes} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Estatísticas do Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Casos Ganhos</span>
                </div>
                <span className="font-medium">{statsMes.ganhos}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  <span className="text-sm">Em Andamento</span>
                </div>
                <span className="font-medium">{statsMes.andamento}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span className="text-sm">Novos Casos</span>
                </div>
                <span className="font-medium">{statsMes.novos}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Resumo Financeiro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Receita Total</p>
                <p className="text-2xl font-bold text-green-500">{currency(resumoFinanceiro.receitaTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Honorários Pendentes</p>
                <p className="text-lg font-medium text-orange-500">{currency(resumoFinanceiro.pendentes)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Despesas do Mês</p>
                <p className="text-lg font-medium text-red-500">{currency(resumoFinanceiro.despesasMes)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
