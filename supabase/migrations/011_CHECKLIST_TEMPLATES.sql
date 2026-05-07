-- Templates de checklist por área jurídica
-- Cada template contém uma lista de tarefas padrão que são criadas
-- automaticamente ao cadastrar um processo daquela área.

create table if not exists public.checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  area        text not null,
  nome        text not null,
  tarefas     jsonb not null default '[]',
  is_global   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- RLS
alter table public.checklist_templates enable row level security;

-- Leitura: templates globais ou do próprio usuário
create policy "checklist_templates: leitura"
  on public.checklist_templates for select
  using (is_global = true or auth.uid() = user_id);

create policy "checklist_templates: escrita própria"
  on public.checklist_templates for insert
  with check (auth.uid() = user_id);

create policy "checklist_templates: atualização própria"
  on public.checklist_templates for update
  using (auth.uid() = user_id);

create policy "checklist_templates: exclusão própria"
  on public.checklist_templates for delete
  using (auth.uid() = user_id);

-- ─── Seed: templates globais por área ────────────────────────

insert into public.checklist_templates (area, nome, is_global, tarefas) values

('Trabalhista', 'Fluxo Padrão — Reclamação Trabalhista', true, '[
  {"titulo": "Analisar CTPS e contratos do reclamante", "prazo_dias": 2, "prioridade": "Alta"},
  {"titulo": "Verificar cálculos de verbas rescisórias", "prazo_dias": 3, "prioridade": "Alta"},
  {"titulo": "Levantar provas: holerites, ponto, e-mails", "prazo_dias": 5, "prioridade": "Alta"},
  {"titulo": "Elaborar contestação", "prazo_dias": 10, "prioridade": "Alta"},
  {"titulo": "Agendar contato com testemunhas", "prazo_dias": 7, "prioridade": "Média"},
  {"titulo": "Preparar documentos para audiência", "prazo_dias": 14, "prioridade": "Média"},
  {"titulo": "Conferir intimação de audiência", "prazo_dias": 1, "prioridade": "Alta"}
]'::jsonb),

('Cível', 'Fluxo Padrão — Ação Cível', true, '[
  {"titulo": "Analisar documentos do cliente", "prazo_dias": 2, "prioridade": "Alta"},
  {"titulo": "Consultar jurisprudência aplicável", "prazo_dias": 3, "prioridade": "Média"},
  {"titulo": "Elaborar petição inicial ou contestação", "prazo_dias": 7, "prioridade": "Alta"},
  {"titulo": "Protocolar peça e guardar comprovante", "prazo_dias": 8, "prioridade": "Alta"},
  {"titulo": "Monitorar publicações no tribunal", "prazo_dias": 5, "prioridade": "Média"},
  {"titulo": "Calcular custas e recolher guia", "prazo_dias": 3, "prioridade": "Alta"}
]'::jsonb),

('Família', 'Fluxo Padrão — Divórcio / Família', true, '[
  {"titulo": "Coletar documentos pessoais das partes e filhos", "prazo_dias": 3, "prioridade": "Alta"},
  {"titulo": "Levantar bens do casal (imóveis, veículos, contas)", "prazo_dias": 5, "prioridade": "Alta"},
  {"titulo": "Verificar regime de bens e data do casamento", "prazo_dias": 2, "prioridade": "Alta"},
  {"titulo": "Elaborar acordo ou petição inicial", "prazo_dias": 7, "prioridade": "Alta"},
  {"titulo": "Orientar cliente sobre guarda e alimentos", "prazo_dias": 3, "prioridade": "Média"},
  {"titulo": "Agendar audiência de mediação (se litigioso)", "prazo_dias": 10, "prioridade": "Média"}
]'::jsonb),

('Tributário', 'Fluxo Padrão — Ação Tributária', true, '[
  {"titulo": "Levantar débitos e certidões negativas", "prazo_dias": 3, "prioridade": "Alta"},
  {"titulo": "Analisar auto de infração ou lançamento", "prazo_dias": 3, "prioridade": "Alta"},
  {"titulo": "Verificar prazo de decadência e prescrição", "prazo_dias": 2, "prioridade": "Alta"},
  {"titulo": "Elaborar defesa administrativa ou impugnação", "prazo_dias": 7, "prioridade": "Alta"},
  {"titulo": "Avaliar adesão a parcelamento (REFIS/PERT)", "prazo_dias": 5, "prioridade": "Média"},
  {"titulo": "Monitorar publicações no DOU/DOE", "prazo_dias": 5, "prioridade": "Média"}
]'::jsonb),

('Inventário', 'Fluxo Padrão — Inventário e Sucessões', true, '[
  {"titulo": "Levantar certidão de óbito e documentos do falecido", "prazo_dias": 2, "prioridade": "Alta"},
  {"titulo": "Mapear herdeiros e meeiros", "prazo_dias": 3, "prioridade": "Alta"},
  {"titulo": "Levantar bens, dívidas e partilha pretendida", "prazo_dias": 7, "prioridade": "Alta"},
  {"titulo": "Calcular ITCMD e emitir guia de recolhimento", "prazo_dias": 10, "prioridade": "Alta"},
  {"titulo": "Elaborar escritura ou petição de inventário", "prazo_dias": 14, "prioridade": "Alta"},
  {"titulo": "Protocolar abertura do inventário (prazo: 60 dias do óbito)", "prazo_dias": 5, "prioridade": "Alta"},
  {"titulo": "Acompanhar avaliação de bens pelo perito", "prazo_dias": 20, "prioridade": "Média"}
]'::jsonb);
