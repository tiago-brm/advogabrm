-- ============================================================
-- AdvogaBRM - Patch 005: Impersonação de Tenant para SUPER_ADMIN
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- Função para SUPER_ADMIN trocar seu tenant ativo no banco
-- Isso faz o RLS filtrar os dados corretamente por aquele escritório
CREATE OR REPLACE FUNCTION public.superadmin_switch_tenant(target_tenant_id UUID)
RETURNS void AS $$
BEGIN
  -- Só SUPER_ADMIN pode usar esta função
  IF public.get_auth_role() != 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Apenas SUPER_ADMIN pode trocar de tenant.';
  END IF;

  -- Verifica se o tenant alvo existe
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = target_tenant_id) THEN
    RAISE EXCEPTION 'Tenant não encontrado.';
  END IF;

  -- Atualiza o tenant_id no perfil do SUPER_ADMIN
  UPDATE public.profiles
  SET tenant_id = target_tenant_id
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Garante que apenas usuários autenticados chamem a função
REVOKE ALL ON FUNCTION public.superadmin_switch_tenant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_switch_tenant(UUID) TO authenticated;
