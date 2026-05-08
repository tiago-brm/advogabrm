-- Mini CRM: enriquecimento da tabela clientes + histórico de interações

-- ─── Novos campos em clientes ────────────────────────────────

alter table public.clientes
  add column if not exists tipo_pessoa     text not null default 'PF'
    check (tipo_pessoa in ('PF', 'PJ')),
  add column if not exists cpf_cnpj        text,
  add column if not exists rg              text,
  add column if not exists razao_social    text,
  add column if not exists telefone_secundario text,
  add column if not exists whatsapp        text,
  add column if not exists cep             text,
  add column if not exists logradouro      text,
  add column if not exists numero          text,
  add column if not exists complemento     text,
  add column if not exists bairro          text,
  add column if not exists cidade          text,
  add column if not exists estado          text,
  add column if not exists data_nascimento date,
  add column if not exists profissao       text,
  add column if not exists origem          text
    check (origem in ('Indicação', 'Site', 'Evento', 'Redes Sociais', 'Outro')),
  add column if not exists observacoes     text;

-- ─── Histórico de interações ─────────────────────────────────

create table if not exists public.cliente_interacoes (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references public.clientes(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  tipo             text not null
    check (tipo in ('Ligação', 'Reunião', 'E-mail', 'WhatsApp', 'Outro')),
  descricao        text not null,
  data_interacao   timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

alter table public.cliente_interacoes enable row level security;

create policy "cliente_interacoes: leitura própria"
  on public.cliente_interacoes for select
  using (auth.uid() = user_id);

create policy "cliente_interacoes: inserção própria"
  on public.cliente_interacoes for insert
  with check (auth.uid() = user_id);

create policy "cliente_interacoes: exclusão própria"
  on public.cliente_interacoes for delete
  using (auth.uid() = user_id);

-- índice para listagem por cliente
create index if not exists idx_cliente_interacoes_cliente_id
  on public.cliente_interacoes (cliente_id, data_interacao desc);
