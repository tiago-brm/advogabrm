-- ============================================================
-- AdvogaBRM - Patch: adiciona campo logo_url_dark na tabela tenants
-- Execute este script no SQL Editor do Supabase
-- ============================================================

ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS logo_url_dark TEXT;

-- Renomeia o tenant padrão se ainda estiver com nome antigo
UPDATE public.tenants 
SET nome = 'AdvogaBRM Default' 
WHERE nome IN ('Advoga PRO Default', 'Advoga BRM Default');
