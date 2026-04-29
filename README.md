# AdvogaBRM — Sistema de Gestão Jurídica

**SaaS Multi-Tenant para Escritórios de Advocacia**  
Desenvolvido por [BRM Solutions](https://brmsolutions.com.br)

---

## Stack

- **Frontend**: React + Vite + TypeScript + shadcn/ui + TailwindCSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage + RLS)
- **Worker**: Node.js com node-cron + Nodemailer
- **Integração**: DataJud CNJ (API Pública)

## Estrutura de Branches

| Branch | Ambiente | Propósito |
|--------|----------|-----------|
| `develop` | Local / Dev | Feature branches são mergeadas aqui |
| `homolog` | Homologação | Testes de QA e UAT antes da produção |
| `prod` | Produção | Deploy final no Easypanel |

## Como Rodar Localmente

```bash
# 1. Copie as variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais do Supabase

# 2. Instale as dependências
npm install

# 3. Rode o frontend
npm run dev

# 4. (Opcional) Rode o worker de agendamentos em outro terminal
npm run worker
```

## Banco de Dados

Execute as migrations na ordem no SQL Editor do Supabase:

1. `supabase/migrations/000_FULL_MIGRATION.sql` — Schema base
2. `supabase/migrations/001_AGENDAMENTOS_SMTP_MIGRATION.sql` — Agendamentos e SMTP
3. `supabase/migrations/002_MULTI_TENANT_MIGRATION.sql` — Arquitetura Multi-Tenant
4. `supabase/migrations/003_REDTEAM_BLUETEAM_SECURITY.sql` — Segurança e Auditoria

## Papéis de Usuário

| Role | Permissões |
|------|-----------|
| `SUPER_ADMIN` | Acesso total a todos os tenants. Criado apenas via SQL. |
| `MASTER` | Administrador do próprio escritório. Pode customizar cores e logo. |
| `USER` | Advogado/colaborador. Acesso apenas aos dados do seu escritório. |

## Variáveis de Ambiente do Worker

Para o worker funcionar em produção, defina no container do Easypanel:

```
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
WORKER_SECRET=seu_segredo_interno
DATAJUD_API_KEY= (opcional)
SMTP_ENCRYPTION_KEY=chave_de_cripto_32_bytes
```
