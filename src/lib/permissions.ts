// Hierarquia de papéis — mesma lógica da função SQL role_level()
export type AppRole =
  | 'SUPER_ADMIN'
  | 'MASTER'
  | 'ADMIN'
  | 'ADVOGADO'
  | 'ESTAGIARIO'
  | 'READONLY'

export const ROLE_LEVEL: Record<AppRole, number> = {
  SUPER_ADMIN: 100,
  MASTER:       80,
  ADMIN:        60,
  ADVOGADO:     40,
  ESTAGIARIO:   20,
  READONLY:     10,
}

export const ROLE_LABELS: Record<AppRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  MASTER:      'Titular / Sócio',
  ADMIN:       'Administrador',
  ADVOGADO:    'Advogado',
  ESTAGIARIO:  'Estagiário',
  READONLY:    'Somente Leitura',
}

// Ações e o nível mínimo necessário
const POLICY: Record<string, number> = {
  // Processos
  'view:processo':    10,
  'create:processo':  40,
  'edit:processo':    40,
  'delete:processo':  60,

  // Clientes
  'view:cliente':     10,
  'create:cliente':   40,
  'edit:cliente':     40,
  'delete:cliente':   60,

  // Financeiro
  'view:financeiro':  60,
  'create:financeiro':60,
  'edit:financeiro':  60,
  'delete:financeiro':60,

  // Equipe
  'view:equipe':      10,
  'view:salario':     60,
  'create:equipe':    60,
  'edit:equipe':      60,
  'delete:equipe':    80,
  'manage:roles':     80,

  // Documentos
  'view:documento':   10,
  'create:documento': 40,
  'edit:documento':   40,
  'delete:documento': 60,

  // Tarefas
  'view:tarefa':      10,
  'create:tarefa':    20,
  'edit:tarefa':      20,
  'delete:tarefa':    40,

  // Audiências
  'view:audiencia':   10,
  'create:audiencia': 40,
  'edit:audiencia':   40,
  'delete:audiencia': 60,

  // Configurações
  'view:config':      60,
  'edit:config':      80,

  // Audit log
  'view:audit':       80,

  // Workflows / BPMN
  'view:workflow':    40,
  'edit:workflow':    60,
}

export function can(role: AppRole | null | undefined, action: string): boolean {
  if (!role) return false
  const userLevel = ROLE_LEVEL[role] ?? 0
  const required  = POLICY[action] ?? 999
  return userLevel >= required
}

export function isAtLeast(role: AppRole | null | undefined, min: AppRole): boolean {
  if (!role) return false
  return (ROLE_LEVEL[role] ?? 0) >= ROLE_LEVEL[min]
}

// Roles que podem ser atribuídos por quem está gerenciando a equipe
// Um MASTER pode atribuir todos exceto SUPER_ADMIN
// Um ADMIN pode atribuir apenas abaixo do próprio nível
export function assignableRoles(byRole: AppRole): AppRole[] {
  const level = ROLE_LEVEL[byRole] ?? 0
  return (Object.keys(ROLE_LEVEL) as AppRole[]).filter(
    (r) => ROLE_LEVEL[r] < level
  )
}
