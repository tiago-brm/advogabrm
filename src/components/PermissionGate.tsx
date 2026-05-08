import { type ReactNode } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import type { AppRole } from '@/lib/permissions'

interface Props {
  action?: string       // ex: 'delete:processo'
  minRole?: AppRole     // ex: 'ADMIN'
  fallback?: ReactNode  // o que mostrar quando sem permissão (padrão: null)
  children: ReactNode
}

/**
 * Oculta children quando o usuário não tem permissão.
 * ATENÇÃO: proteção real está nas RLS do banco — este componente é só UX.
 */
export function PermissionGate({ action, minRole, fallback = null, children }: Props) {
  const { can, isAtLeast } = usePermissions()

  const allowed =
    (action  ? can(action)         : true) &&
    (minRole ? isAtLeast(minRole)  : true)

  return allowed ? <>{children}</> : <>{fallback}</>
}
