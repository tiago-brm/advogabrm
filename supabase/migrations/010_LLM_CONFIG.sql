-- Configuração de provedor LLM por usuário
-- Armazena chave de API e preferências de modelo para uso nas features de IA

create table if not exists public.user_llm_configs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  provider    text not null check (provider in ('openai', 'anthropic', 'google', 'openrouter')),
  api_key     text not null,
  model       text not null,
  base_url    text,          -- usado para OpenRouter ou endpoints customizados
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id)           -- um registro por usuário; use upsert para atualizar
);

-- RLS: cada usuário acessa apenas sua própria configuração
alter table public.user_llm_configs enable row level security;

create policy "user_llm_configs: leitura própria"
  on public.user_llm_configs for select
  using (auth.uid() = user_id);

create policy "user_llm_configs: inserção própria"
  on public.user_llm_configs for insert
  with check (auth.uid() = user_id);

create policy "user_llm_configs: atualização própria"
  on public.user_llm_configs for update
  using (auth.uid() = user_id);

create policy "user_llm_configs: exclusão própria"
  on public.user_llm_configs for delete
  using (auth.uid() = user_id);

-- Atualiza updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_llm_configs_updated_at
  before update on public.user_llm_configs
  for each row execute function public.set_updated_at();
