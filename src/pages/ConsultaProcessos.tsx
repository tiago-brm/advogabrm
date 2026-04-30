import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, FileText, AlertCircle, User, Hash, CreditCard, ChevronDown, ChevronUp, Calendar, Building2, Scale } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RpaEnrichmentPanel } from "@/components/RpaEnrichmentPanel";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Parte {
  nome: string;
  tipo: string;
  docPrincipal?: { nrDoc: string; tpDoc: string };
  advogados?: Array<{ nome: string; inscricao: string }>;
}

interface Movimento {
  codigo: number;
  nome: string;
  dataHora: string;
  complementosTabelados?: Array<{ codigo: number; nome: string; descricao: string; valor?: number }>;
}

interface ProcessoResult {
  numeroProcesso: string;
  classe?: { codigo: number; nome: string } | string;
  tribunal?: string;
  sistema?: string;
  formato?: string;
  grau?: string;
  dataAjuizamento?: string;
  dataHoraUltimaAtualizacao?: string;
  orgaoJulgador?: { codigo?: number; nome: string; codigoMunicipioIBGE?: number };
  assuntos?: Array<{ codigo: number; nome: string }>;
  nivelSigilo?: number;
  partes?: Parte[];
  movimentos?: Movimento[];
}

async function consultarAvancado(
  alias: string,
  filtros: { dataInicial?: string; dataFinal?: string; assunto?: string },
  from: number = 0,
  size: number = 20,
  apiKey?: string
): Promise<{ processos: ProcessoResult[], total: number }> {
  const queryParts: any[] = [];

  if (filtros.dataInicial || filtros.dataFinal) {
    const range: any = {};
    if (filtros.dataInicial) {
      // Formato YYYYMMDDHHMMSS - começa no primeiro segundo do dia
      const d = filtros.dataInicial.replace(/-/g, "");
      range.gte = `${d}000000`;
    }
    if (filtros.dataFinal) {
      // Termina no último segundo do dia
      const d = filtros.dataFinal.replace(/-/g, "");
      range.lte = `${d}235959`;
    }
    queryParts.push({ range: { dataAjuizamento: range } });
  }

  if (filtros.assunto && filtros.assunto.trim() !== "") {
    queryParts.push({ match: { "assuntos.nome": filtros.assunto.trim() } });
  }

  const body = {
    query: queryParts.length > 0 ? { bool: { must: queryParts } } : { match_all: {} },
    size: size,
    from: from,
    sort: [{ dataAjuizamento: { order: "desc" } }]
  };
  
  console.log(`[DataJud] Consultando Avançado na URL: ${buildUrl(alias)}`);
  console.log(`[DataJud] Payload:`, JSON.stringify(body, null, 2));

  const res = await fetch(buildUrl(alias), {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}: ${res.statusText}`);
  const data = await res.json();
  
  const hits = data?.hits?.hits ?? [];
  const total = data?.hits?.total?.value ?? hits.length;

  return {
    processos: hits.map((h: { _source: ProcessoResult }) => h._source),
    total
  };
}

// ─── Dados dos Tribunais ──────────────────────────────────────────────────────

const TRIBUNAIS = [
  // Superiores
  { nome: "Supremo Tribunal Federal", alias: "stf", cat: "Tribunais Superiores" },
  { nome: "Superior Tribunal de Justiça", alias: "stj", cat: "Tribunais Superiores" },
  { nome: "Tribunal Superior do Trabalho", alias: "tst", cat: "Tribunais Superiores" },
  { nome: "Tribunal Superior Eleitoral", alias: "tse", cat: "Tribunais Superiores" },
  { nome: "Superior Tribunal Militar", alias: "stm", cat: "Tribunais Superiores" },
  // Federal
  { nome: "TRF 1ª Região", alias: "trf1", cat: "Justiça Federal" },
  { nome: "TRF 2ª Região", alias: "trf2", cat: "Justiça Federal" },
  { nome: "TRF 3ª Região", alias: "trf3", cat: "Justiça Federal" },
  { nome: "TRF 4ª Região", alias: "trf4", cat: "Justiça Federal" },
  { nome: "TRF 5ª Região", alias: "trf5", cat: "Justiça Federal" },
  { nome: "TRF 6ª Região", alias: "trf6", cat: "Justiça Federal" },
  // Trabalho
  { nome: "TRT 1ª Região (RJ)", alias: "trt1", cat: "Justiça do Trabalho" },
  { nome: "TRT 2ª Região (SP)", alias: "trt2", cat: "Justiça do Trabalho" },
  { nome: "TRT 3ª Região (MG)", alias: "trt3", cat: "Justiça do Trabalho" },
  { nome: "TRT 4ª Região (RS)", alias: "trt4", cat: "Justiça do Trabalho" },
  { nome: "TRT 5ª Região (BA)", alias: "trt5", cat: "Justiça do Trabalho" },
  { nome: "TRT 15ª Região (Campinas)", alias: "trt15", cat: "Justiça do Trabalho" },
  // Estadual
  { nome: "TJAC", alias: "tjac", cat: "Justiça Estadual" },
  { nome: "TJAL", alias: "tjal", cat: "Justiça Estadual" },
  { nome: "TJAM", alias: "tjam", cat: "Justiça Estadual" },
  { nome: "TJAP", alias: "tjap", cat: "Justiça Estadual" },
  { nome: "TJBA", alias: "tjba", cat: "Justiça Estadual" },
  { nome: "TJCE", alias: "tjce", cat: "Justiça Estadual" },
  { nome: "TJDFT", alias: "tjdft", cat: "Justiça Estadual" },
  { nome: "TJES", alias: "tjes", cat: "Justiça Estadual" },
  { nome: "TJGO", alias: "tjgo", cat: "Justiça Estadual" },
  { nome: "TJMA", alias: "tjma", cat: "Justiça Estadual" },
  { nome: "TJMG", alias: "tjmg", cat: "Justiça Estadual" },
  { nome: "TJMS", alias: "tjms", cat: "Justiça Estadual" },
  { nome: "TJMT", alias: "tjmt", cat: "Justiça Estadual" },
  { nome: "TJPA", alias: "tjpa", cat: "Justiça Estadual" },
  { nome: "TJPB", alias: "tjpb", cat: "Justiça Estadual" },
  { nome: "TJPE", alias: "tjpe", cat: "Justiça Estadual" },
  { nome: "TJPI", alias: "tjpi", cat: "Justiça Estadual" },
  { nome: "TJPR", alias: "tjpr", cat: "Justiça Estadual" },
  { nome: "TJRJ", alias: "tjrj", cat: "Justiça Estadual" },
  { nome: "TJRN", alias: "tjrn", cat: "Justiça Estadual" },
  { nome: "TJRO", alias: "tjro", cat: "Justiça Estadual" },
  { nome: "TJRR", alias: "tjrr", cat: "Justiça Estadual" },
  { nome: "TJRS", alias: "tjrs", cat: "Justiça Estadual" },
  { nome: "TJSC", alias: "tjsc", cat: "Justiça Estadual" },
  { nome: "TJSE", alias: "tjse", cat: "Justiça Estadual" },
  { nome: "TJSP", alias: "tjsp", cat: "Justiça Estadual" },
  { nome: "TJTO", alias: "tjto", cat: "Justiça Estadual" },
];

const CATEGORIAS = ["Tribunais Superiores", "Justiça Federal", "Justiça do Trabalho", "Justiça Estadual"];

// ─── Constantes ───────────────────────────────────────────────────────────────

const DATAJUD_API_KEY_PUBLIC = "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

// ─── Funções de consulta ──────────────────────────────────────────────────────

function buildUrl(alias: string) {
  return `/datajud-api/api_publica_${alias}/_search`;
}

function buildHeaders(customKey?: string) {
  return {
    "Content-Type": "application/json",
    Authorization: customKey || DATAJUD_API_KEY_PUBLIC,
  };
}

async function consultarPorNumero(alias: string, numero: string, apiKey?: string): Promise<ProcessoResult[]> {
  const numLimpo = numero.replace(/[.\-]/g, "");
  const body = {
    query: { match: { numeroProcesso: numLimpo } },
  };
  
  console.log(`[DataJud] Consultando por Número na URL: ${buildUrl(alias)}`);
  console.log(`[DataJud] Payload:`, JSON.stringify(body, null, 2));

  const res = await fetch(buildUrl(alias), {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}: ${res.statusText}`);
  const data = await res.json();
  
  console.log(`[DataJud] Resposta:`, data);
  
  return (data?.hits?.hits ?? []).map((h: { _source: ProcessoResult }) => h._source);
}

async function consultarPorDocumento(alias: string, cpfCnpj: string, apiKey?: string): Promise<ProcessoResult[]> {
  const docLimpo = cpfCnpj.replace(/[\.\-\/]/g, "");
  const body = {
    query: { match: { "partes.docPrincipal.nrDoc": docLimpo } },
    size: 10,
  };
  
  console.log(`[DataJud] Consultando por CPF/CNPJ na URL: ${buildUrl(alias)}`);
  console.log(`[DataJud] Payload:`, JSON.stringify(body, null, 2));

  const res = await fetch(buildUrl(alias), {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}: ${res.statusText}`);
  const data = await res.json();
  
  console.log(`[DataJud] Resposta:`, data);
  
  return (data?.hits?.hits ?? []).map((h: { _source: ProcessoResult }) => h._source);
}

async function consultarPorNome(alias: string, nome: string, apiKey?: string): Promise<ProcessoResult[]> {
  const body = {
    query: { match: { "partes.nome": nome } },
    size: 10,
  };
  
  console.log(`[DataJud] Consultando por Nome na URL: ${buildUrl(alias)}`);
  console.log(`[DataJud] Payload:`, JSON.stringify(body, null, 2));

  const res = await fetch(buildUrl(alias), {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}: ${res.statusText}`);
  const data = await res.json();
  
  console.log(`[DataJud] Resposta:`, data);
  
  return (data?.hits?.hits ?? []).map((h: { _source: ProcessoResult }) => h._source);
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

function formatarData(d?: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return d; }
}

function formatarNumero(n?: string) {
  if (!n) return "—";
  const s = n.replace(/\D/g, "");
  if (s.length === 20)
    return `${s.slice(0,7)}-${s.slice(7,9)}.${s.slice(9,13)}.${s.slice(13,14)}.${s.slice(14,16)}.${s.slice(16,20)}`;
  return n;
}

function classeNome(c?: ProcessoResult["classe"]): string {
  if (!c) return "—";
  if (typeof c === "string") return c;
  return c.nome ?? "—";
}

function grauBadgeColor(grau?: string) {
  if (!grau) return "secondary";
  if (grau.includes("1")) return "default";
  if (grau.includes("2")) return "outline";
  return "secondary";
}

// ─── Card de resultado ────────────────────────────────────────────────────────

function ProcessoCard({ p, tribunalAlias }: { p: ProcessoResult; tribunalAlias: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base font-mono tracking-tight">
              {formatarNumero(p.numeroProcesso)}
            </CardTitle>
            <CardDescription className="mt-1">{classeNome(p.classe)}</CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            {p.grau && <Badge variant={grauBadgeColor(p.grau) as "default" | "secondary" | "outline"}>{p.grau}</Badge>}
            {p.nivelSigilo !== undefined && p.nivelSigilo > 0 && (
              <Badge variant="destructive">Sigilo {p.nivelSigilo}</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Linha de info rápida */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{p.orgaoJulgador?.nome ?? "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>Ajuizado: {formatarData(p.dataAjuizamento)}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Scale className="h-3.5 w-3.5 shrink-0" />
            <span>Atualiz: {formatarData(p.dataHoraUltimaAtualizacao)}</span>
          </div>
        </div>

        {/* Assuntos */}
        {p.assuntos && p.assuntos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {p.assuntos.slice(0, 4).map((a) => (
              <Badge key={a.codigo} variant="secondary" className="text-xs">{a.nome}</Badge>
            ))}
            {p.assuntos.length > 4 && (
              <Badge variant="secondary" className="text-xs">+{p.assuntos.length - 4}</Badge>
            )}
          </div>
        )}

        {/* Partes */}
        {p.partes && p.partes.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Partes</p>
            <div className="space-y-1">
              {p.partes.slice(0, expanded ? undefined : 3).map((parte, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium">{parte.nome}</span>
                  <Badge variant="outline" className="text-xs ml-auto shrink-0">{parte.tipo}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Movimentos - só no modo expandido */}
        {expanded && p.movimentos && p.movimentos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
              Movimentos ({p.movimentos.length})
            </p>
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {p.movimentos.map((m, i) => (
                <div key={i} className="border-l-2 border-gray-200 pl-3 text-sm">
                  <p className="font-medium">{m.nome}</p>
                  <p className="text-xs text-muted-foreground">{formatarData(m.dataHora)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expandir */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="w-full text-xs text-muted-foreground"
        >
          {expanded ? <><ChevronUp className="h-3 w-3 mr-1" /> Menos detalhes</> : <><ChevronDown className="h-3 w-3 mr-1" /> Ver movimentos e mais</>}
        </Button>

        {/* Enriquecimento RPA + Cadastro */}
        <RpaEnrichmentPanel processo={p} tribunalAlias={tribunalAlias} />
      </CardContent>
    </Card>
  );
}

// ─── Select de Tribunal ───────────────────────────────────────────────────────

function TribunalSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Selecione o tribunal" />
      </SelectTrigger>
      <SelectContent>
        {CATEGORIAS.map((cat) => (
          <div key={cat}>
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">
              {cat}
            </div>
            {TRIBUNAIS.filter((t) => t.cat === cat).map((t) => (
              <SelectItem key={t.alias} value={t.alias}>{t.nome}</SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AgendarBuscaModal } from "@/components/AgendarBuscaModal";

export default function ConsultaProcessos() {
  const { user } = useAuth();
  const [tribunal, setTribunal] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<ProcessoResult[]>([]);
  const [erro, setErro] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");

  // Inputs por tipo
  const [numeroProcesso, setNumeroProcesso] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [nomePartes, setNomePartes] = useState("");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [assuntoFiltro, setAssuntoFiltro] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [totalResultados, setTotalResultados] = useState(0);
  const pageSize = 20;

  React.useEffect(() => {
    async function loadKey() {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("datajud_api_key")
        .eq("id", user.id)
        .single();
      
      if (data?.datajud_api_key) {
        setCustomApiKey(data.datajud_api_key);
      }
    }
    loadKey();
  }, [user]);

  async function executar(tipo: "numero" | "documento" | "nome" | "avancado", page = 1) {
    if (!tribunal) { setErro("Selecione um tribunal"); return; }

    setLoading(true);
    setErro("");
    if (page === 1) {
      setResultados([]);
      setTotalResultados(0);
    }
    setCurrentPage(page);

    try {
      let res: ProcessoResult[] = [];
      let totalCount = 0;
      if (tipo === "numero") {
        if (!numeroProcesso.trim()) { setErro("Informe o número do processo"); setLoading(false); return; }
        res = await consultarPorNumero(tribunal, numeroProcesso.trim(), customApiKey);
      } else if (tipo === "documento") {
        if (!cpfCnpj.trim()) { setErro("Informe o CPF ou CNPJ"); setLoading(false); return; }
        if (!customApiKey) {
          setErro("Para buscar por CPF/CNPJ, configure sua Chave de API Privada na aba Configurações.");
          setLoading(false);
          return;
        }
        res = await consultarPorDocumento(tribunal, cpfCnpj.trim(), customApiKey);
      } else if (tipo === "nome") {
        if (!nomePartes.trim()) { setErro("Informe o nome da parte"); setLoading(false); return; }
        if (!customApiKey) {
          setErro("Para buscar por Nome, configure sua Chave de API Privada na aba Configurações.");
          setLoading(false);
          return;
        }
        res = await consultarPorNome(tribunal, nomePartes.trim(), customApiKey);
        totalCount = res.length;
      } else if (tipo === "avancado") {
        if (!dataInicial && !dataFinal && !assuntoFiltro.trim()) {
          setErro("Informe ao menos uma data ou assunto para a busca avançada.");
          setLoading(false);
          return;
        }
        const from = (page - 1) * pageSize;
        const avancadoRes = await consultarAvancado(tribunal, { 
          dataInicial, 
          dataFinal, 
          assunto: assuntoFiltro 
        }, from, pageSize, customApiKey);
        res = avancadoRes.processos;
        totalCount = avancadoRes.total;
      }

      if (res.length === 0) setErro("Nenhum processo encontrado.");
      else {
        setResultados(res);
        if (tipo !== "avancado") setTotalResultados(res.length);
        else setTotalResultados(totalCount);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErro(`Erro na consulta: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-5xl">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
          <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Consulta de Processos</h1>
          <p className="text-sm text-muted-foreground">API Pública DataJud — CNJ</p>
        </div>
      </div>

      {/* Card de busca */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Processo</CardTitle>
          <CardDescription>
            Consulta direta à API pública do DataJud (CNJ). Selecione o tipo de busca e o tribunal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tribunal */}
          <div className="space-y-2">
            <Label>Tribunal *</Label>
            <TribunalSelect value={tribunal} onChange={setTribunal} />
          </div>

          {/* Tabs de tipo de consulta */}
          <Tabs defaultValue="numero" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="numero" className="flex items-center gap-2">
                <Hash className="w-4 h-4" /> <span className="hidden sm:inline">Por Número</span>
              </TabsTrigger>
              <TabsTrigger value="avancado" className="flex items-center gap-2">
                <Search className="w-4 h-4" /> <span className="hidden sm:inline">Por Data e Assunto</span>
              </TabsTrigger>
            </TabsList>

            {/* Aba 1: Número do processo */}
            <TabsContent value="numero" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="numeroProcesso">Número do Processo (CNJ)</Label>
                <Input
                  id="numeroProcesso"
                  placeholder="Ex: 0000832-35.2018.4.01.3202 ou 00008323520184013202"
                  value={numeroProcesso}
                  onChange={(e) => setNumeroProcesso(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && executar("numero")}
                />
                <p className="text-xs text-muted-foreground">
                  Aceita com ou sem formatação. O número é normalizado automaticamente.
                </p>
              </div>
              <Button
                onClick={() => executar("numero")}
                disabled={loading || !tribunal || !numeroProcesso}
                className="w-full sm:w-auto"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                {loading ? "Consultando..." : "Buscar por Número"}
              </Button>
            </TabsContent>
            
            {/* Aba 4: Avançado (Data) */}
            <TabsContent value="avancado" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data de Ajuizamento (A partir de)</Label>
                  <Input
                    type="date"
                    value={dataInicial}
                    onChange={(e) => setDataInicial(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data de Ajuizamento (Até)</Label>
                  <Input
                    type="date"
                    value={dataFinal}
                    onChange={(e) => setDataFinal(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Assunto Principal (Opcional)</Label>
                <Input
                  placeholder="Ex: Indenização por Dano Moral"
                  value={assuntoFiltro}
                  onChange={(e) => setAssuntoFiltro(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Busca processos distribuídos nesse período ou com esse assunto. Retorna até 20 resultados.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700" 
                  onClick={() => executar("avancado", 1)} 
                  disabled={loading || !tribunal || (!dataInicial && !dataFinal && !assuntoFiltro.trim())}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  {loading ? "Consultando..." : "Buscar Avançado"}
                </Button>
                <AgendarBuscaModal 
                  tribunal={tribunal}
                  dataInicial={dataInicial}
                  dataFinal={dataFinal}
                  assunto={assuntoFiltro}
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Erro */}
      {erro && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Resultados <Badge className="ml-2">{resultados.length}</Badge>
            </h2>
          </div>
          <div className="space-y-4">
            {resultados.map((p, i) => (
              <ProcessoCard key={p.numeroProcesso ?? i} p={p} tribunalAlias={tribunal} />
            ))}
          </div>

          {totalResultados > pageSize && (
            <div className="flex items-center justify-between border-t pt-4 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => executar("avancado", currentPage - 1)}
                disabled={currentPage === 1 || loading}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {currentPage} de {Math.ceil(totalResultados / pageSize)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => executar("avancado", currentPage + 1)}
                disabled={currentPage >= Math.ceil(totalResultados / pageSize) || loading}
              >
                Próxima
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
