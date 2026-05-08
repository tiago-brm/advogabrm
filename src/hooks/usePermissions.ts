import { useTenant } from '@/contexts/TenantContext'
import { can, isAtLeast, type AppRole } from '@/lib/permissions'

export function usePermissions() {
  const { role } = useTenant()

  const appRole = role as AppRole | null

  return {
    role: appRole,
    can:       (action: string)   => can(appRole, action),
    isAtLeast: (min: AppRole)     => isAtLeast(appRole, min),
    isMaster:  appRole === 'MASTER'      || appRole === 'SUPER_ADMIN',
    isAdmin:   isAtLeast(appRole, 'ADMIN'),
    isSuper:   appRole === 'SUPER_ADMIN',
  }
}
