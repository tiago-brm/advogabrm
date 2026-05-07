# Melhorias Futuras — Resumo de PDF com IA

Documento de referência para evolução do módulo de análise de PDFs via IA.
A implementação atual (`summarizePdfWithLlm` em `llmService.ts`) é funcional mas simplificada.
Este documento registra o que deve ser revisitado antes de escalar o uso.

---

## 1. Detecção de tipo de PDF antes de enviar para a IA

### Problema atual
A implementação atual trata todos os PDFs da mesma forma por provedor:
- Anthropic/Google: envia base64 direto (multimodal)
- OpenAI/OpenRouter: faz extração de texto com regex BT/ET

### O que fazer
Antes de qualquer envio, detectar se o PDF é **texto digital** ou **escaneado (imagem)**.

**Como detectar:**
- Tentar extrair texto via BT/ET parsing
- Se o texto extraído tiver menos de N caracteres (ex: < 100) para um PDF com múltiplas páginas → provavelmente escaneado
- Se tiver texto suficiente → PDF digital → usar extração de texto para todos os provedores (mais barato que multimodal)

**Benefício:** Evitar envio de base64 multimodal para Anthropic/Google quando o texto já pode ser extraído localmente — reduz custo em até 80% para PDFs digitais.

```
Fluxo ideal:
1. Tentar extrair texto (BT/ET ou pdfjs)
2. Se texto suficiente → enviar como texto para qualquer provedor
3. Se texto insuficiente → PDF escaneado → enviar base64 para provedores multimodais
4. Se provedor não suporta multimodal → informar usuário que o PDF precisa ser OCR'd
```

---

## 2. Chunking automático para PDFs grandes

### Problema atual
O texto extraído é truncado em 12.000 caracteres (`text.slice(0, 12000)`). PDFs longos perdem conteúdo silenciosamente.

### O que fazer
Implementar chunking com estratégia de sumarização em cascata:

```
Documento grande
    │
    ├── Chunk 1 (ex: 4.000 tokens) → Resumo parcial 1
    ├── Chunk 2 (ex: 4.000 tokens) → Resumo parcial 2
    ├── Chunk 3 (ex: 4.000 tokens) → Resumo parcial 3
    │
    └── Resumo dos resumos → Resumo final
```

**Parâmetros sugeridos:**
- Tamanho do chunk: 3.500 tokens (~14.000 caracteres)
- Overlap entre chunks: 200 tokens para não perder contexto entre partes
- Máximo de chunks: 10 (limitar documentos absurdamente longos)
- Avisar o usuário se o documento exceder o limite

**Referência de implementação:** LangChain `RecursiveCharacterTextSplitter` como inspiração de lógica, sem precisar da biblioteca.

---

## 3. OCR para PDFs escaneados

### Problema atual
PDFs escaneados (ex: documentos físicos digitalizados) não têm texto extraível. A implementação atual falha com mensagem de erro.

### O que fazer
Integrar OCR antes de enviar para a IA:

**Opção 1 — Tesseract.js (client-side, sem custo de API):**
- Biblioteca open-source que roda OCR no browser
- Suporta português (`por`)
- Lento para PDFs longos mas funciona sem backend
- `npm install tesseract.js`

**Opção 2 — Google Cloud Vision API:**
- Melhor precisão, especialmente para documentos jurídicos com fontes especiais
- Custo por página (~$0.0015/página)
- Requer backend para não expor chave

**Fluxo sugerido:**
1. Detectar PDF escaneado (ver item 1)
2. Converter páginas PDF em imagens (canvas + pdf.js)
3. Aplicar OCR em cada imagem
4. Montar texto resultante
5. Enviar texto para LLM normalmente (mais barato que multimodal)

---

## 4. Extração de texto com pdf.js em vez de regex BT/ET

### Problema atual
A extração via regex em streams BT/ET é frágil. Falha em PDFs com:
- Encoding de texto não-padrão (CIDFont, Type0)
- Streams comprimidos (FlateDecode)
- Texto em múltiplos encodings no mesmo documento

### O que fazer
Substituir a extração manual por `pdfjs-dist`:

```typescript
import * as pdfjsLib from 'pdfjs-dist';

async function extractTextWithPdfJs(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, (_, i) =>
      pdf.getPage(i + 1).then(p => p.getTextContent())
    )
  );
  return pages
    .flatMap(p => p.items.map((item: any) => item.str))
    .join(' ');
}
```

**Vantagens:** Lida com todos os encodings, compressão, CIDFont — cobertura ~100% de PDFs digitais.
**Custo:** `pdfjs-dist` adiciona ~400KB ao bundle. Usar dynamic import para não impactar carregamento inicial.

```typescript
// Carregar sob demanda apenas quando necessário
const pdfjsLib = await import('pdfjs-dist');
```

---

## 5. Cache de resumos por documento

### Problema atual
Cada clique em "Resumir com IA" faz uma nova chamada à API, mesmo que o documento não tenha mudado.

### O que fazer
Armazenar o resumo gerado junto ao registro do documento:

**Opção 1 — Coluna na tabela `documentos`:**
```sql
alter table documentos add column ai_summary text;
alter table documentos add column ai_summary_at timestamptz;
```
- Ao gerar resumo, salvar na coluna
- Ao abrir o dialog, verificar se já existe resumo recente (ex: < 30 dias)
- Exibir resumo cacheado com badge "Gerado em [data]" + botão "Atualizar"

**Opção 2 — Tabela separada `document_ai_analyses`:**
- Mais flexível se quiser guardar múltiplos tipos de análise (resumo, cláusulas, partes)
- Permite histórico de versões do resumo

**Recomendação:** Opção 1 para MVP, Opção 2 quando adicionar análise de cláusulas (item 2.3 do roadmap).

---

## 6. Análise estruturada vs. resumo livre

### Problema atual
O resultado da IA é texto livre (markdown). O usuário não pode filtrar ou buscar por campos específicos.

### O que fazer
Instruir a IA a retornar JSON estruturado e fazer parse no frontend:

```typescript
const STRUCTURED_PROMPT = `
Analise o documento e retorne um JSON com esta estrutura exata:
{
  "tipo_documento": "string",
  "partes": [{ "nome": "string", "papel": "string" }],
  "objeto": "string",
  "obrigacoes": [{ "parte": "string", "obrigacao": "string" }],
  "datas": [{ "descricao": "string", "data": "YYYY-MM-DD ou null" }],
  "clausulas_risco": [{ "clausula": "string", "risco": "string" }],
  "resumo_executivo": "string"
}
Retorne apenas o JSON, sem texto adicional.
`;
```

**Benefícios:**
- Permite criar cards visuais por seção
- Permite salvar campos individualmente no banco
- Permite buscar documentos por tipo, partes, datas
- Base para o "Conflict check" (item 2.3) — buscar nome de partes nos documentos

**Risco:** Alguns modelos menores falham em JSON estritamente estruturado. Usar `try/catch` com fallback para texto livre.

---

## 7. Limite de tamanho e alerta de custo

### Problema atual
Nenhum aviso sobre tamanho do arquivo antes de enviar para a IA. Um PDF de 50MB enviado como base64 para Anthropic consome tokens caros.

### O que fazer
Antes de processar:
1. Verificar tamanho do arquivo: `pdfBlob.size`
2. Definir limites por estratégia:
   - Texto extraído: máximo 500KB de PDF (geralmente ~100 páginas)
   - Base64 multimodal: máximo 5MB (Anthropic limita em 32MB, mas é caro)
3. Avisar o usuário com estimativa de páginas e custo aproximado:
   > "Este documento tem aproximadamente 45 páginas. O resumo pode consumir ~8.000 tokens."

---

## 8. Suporte a outros formatos além de PDF

### Estado atual
Só PDFs são habilitados para resumo (`.endsWith('.pdf')`).

### Formatos a suportar futuramente
| Formato | Estratégia |
|---|---|
| `.docx` | Extrair XML interno do ZIP e parsear `word/document.xml` |
| `.txt` | Leitura direta como texto — mais simples |
| `.odt` | Extrair XML interno do ZIP similar ao DOCX |
| Imagem (`.jpg`, `.png`) | Enviar como base64 para provedores multimodais |

**Ordem sugerida de implementação:** txt → docx → imagem → odt

---

## Ordem de prioridade das melhorias

| # | Melhoria | Impacto | Complexidade | Quando fazer |
|---|---|---|---|---|
| 1 | Detecção de tipo (digital vs. escaneado) | Alto — reduz custo | Baixa | Próxima iteração |
| 2 | Cache de resumos na tabela `documentos` | Alto — UX + custo | Baixa | Próxima iteração |
| 3 | Substituir BT/ET por pdf.js | Alto — cobertura | Média | Antes de lançar para usuários |
| 4 | Chunking automático | Médio — PDFs longos | Média | Quando houver reclamação de truncamento |
| 5 | Retorno JSON estruturado | Médio — base para busca | Média | Junto com análise de cláusulas |
| 6 | Limite de tamanho + aviso de custo | Médio — controle | Baixa | Antes de lançar para usuários |
| 7 | OCR para escaneados | Baixo — caso raro | Alta | Apenas se houver demanda |
| 8 | Outros formatos | Baixo | Variável | Depois de PDF estar maduro |
