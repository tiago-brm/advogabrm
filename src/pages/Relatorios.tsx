import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { isPast, subDays, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ReceitasChart } from "@/components/relatorios/ReceitasChart";
import { DollarSign, AlertTriangle, CheckCircle } from "lucide-react";

const Relatorios = () => {
    const [lancamentos, setLancamentos] = useState<any[]>([]);

    useEffect(() => {
      const load = async () => {
        const { data, error } = await supabase
          .from('financeiro_lancamentos')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) {
          console.error(error);
          return;
        }
        setLancamentos(data || []);
      };
      load();
    }, []);

    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);

    const aReceber = (lancamentos || [])
        .filter((l: any) => l.status !== 'Pago')
        .reduce((acc: number, l: any) => acc + Number(l.valor), 0);

    const recebidoUltimos30Dias = (lancamentos || [])
        .filter((l: any) => l.status === 'Pago' && l.data_pagamento && parseISO(l.data_pagamento) >= thirtyDaysAgo)
        .reduce((acc: number, l: any) => acc + Number(l.valor), 0);
    
    const lancamentosAtrasadosCount = (lancamentos || [])
        .filter((l: any) => l.status === 'Pendente' && l.data_vencimento && isPast(parseISO(l.data_vencimento)))
        .length;

    const receitasPorMes = (lancamentos || [])
        .filter((l: any) => l.status === 'Pago' && l.data_pagamento)
        .reduce((acc: Record<string, { total: number; label: string }>, l: any) => {
            const dataPagamento = parseISO(l.data_pagamento as string);
            const mesChave = format(dataPagamento, 'yyyy-MM');
            if (!acc[mesChave]) {
                acc[mesChave] = { total: 0, label: '' };
            }
            acc[mesChave].total += Number(l.valor);
            const mesLabel = format(dataPagamento, 'MMM/yy', { locale: ptBR });
            acc[mesChave].label = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
            return acc;
        }, {} as Record<string, { total: number; label: string }>);

    const chartData = Object.keys(receitasPorMes)
      .sort()
      .map((key) => ({ name: receitasPorMes[key].label, total: receitasPorMes[key].total }));

    return (
        <div className="p-6 animate-fade-in">
            <h1 className="text-3xl font-bold mb-8">Relatórios Financeiros</h1>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total a Receber</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{aReceber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        <p className="text-xs text-muted-foreground">Valor de todos lançamentos pendentes.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Recebido (Últimos 30 dias)</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{recebidoUltimos30Dias.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        <p className="text-xs text-muted-foreground">Soma dos valores pagos recentemente.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Lançamentos Atrasados</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{lancamentosAtrasadosCount}</div>
                        <p className="text-xs text-muted-foreground">Lançamentos pendentes com data vencida.</p>
                    </CardContent>
                </Card>
            </div>
            
            <div className="mt-8">
              <ReceitasChart data={chartData} />
            </div>
        </div>
    )
}

export default Relatorios;
