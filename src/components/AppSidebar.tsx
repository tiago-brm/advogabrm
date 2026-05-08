import {
  BarChart3,
  Calendar,
  FileText,
  Gavel,
  Home,
  Settings,
  Users,
  Briefcase,
  Clock,
  MessageSquare,
  DollarSign,
  LogOut,
  CalendarDays,
  UserCheck,
  Search,
  Workflow,
  ListTodo,
  Edit3,
  Eye,
  Bot,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { can, isAtLeast, type AppRole } from "@/lib/permissions";

function itemVisible(item: MenuItem, role: AppRole | null): boolean {
  if (item.minRole && !isAtLeast(role, item.minRole)) return false;
  if (item.minAction && !can(role, item.minAction)) return false;
  return true;
}

type MenuItem = { title: string; url: string; icon: React.ElementType; minAction?: string; minRole?: AppRole }

const menuItems: MenuItem[] = [
  { title: "Dashboard",        url: "/",                   icon: Home },
  { title: "Clientes",         url: "/clientes",           icon: Users,       minAction: "view:cliente" },
  { title: "Processos",        url: "/processos",          icon: Briefcase,   minAction: "view:processo" },
  { title: "Consulta Datajud", url: "/consulta-processos", icon: Search,      minAction: "view:processo" },
  { title: "Monitoramento",    url: "/monitoramento",      icon: Eye,         minAction: "view:processo" },
  { title: "Audiências",       url: "/audiencias",         icon: Calendar,    minAction: "view:audiencia" },
  { title: "Tarefas",          url: "/tarefas",            icon: Clock,       minAction: "view:tarefa" },
  { title: "Documentos",       url: "/documentos",         icon: FileText,    minAction: "view:documento" },
];

const secondaryItems: MenuItem[] = [
  { title: "Agenda",     url: "/agenda",     icon: CalendarDays },
  { title: "Equipe",     url: "/equipe",     icon: UserCheck,   minAction: "view:equipe" },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign,  minAction: "view:financeiro" },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3,   minAction: "view:financeiro" },
  { title: "Mensagens",  url: "/mensagens",  icon: MessageSquare },
];

const legalopsItems: MenuItem[] = [
  { title: "Catálogo",        url: "/bpmn/catalogo",         icon: Workflow,  minAction: "view:workflow" },
  { title: "Minhas Tarefas",  url: "/bpmn/tarefas",          icon: ListTodo,  minAction: "view:tarefa" },
  { title: "Monitor RPA",     url: "/bpmn/rpa-monitor",      icon: Bot,       minAction: "view:workflow" },
  { title: "Modelador BPMN",  url: "/admin/bpmn-modeler",    icon: Edit3,     minRole: "SUPER_ADMIN" },
  { title: "Workflow Editor", url: "/admin/workflow-editor",  icon: Workflow,  minRole: "SUPER_ADMIN" },
];

export function AppSidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { tenant, role } = useTenant();
  const { resolvedTheme } = useTheme();

  // Seleciona a logo correta por tema
  const isDark = resolvedTheme === "dark";
  const tenantLogo = isDark ? (tenant?.logo_url_dark || tenant?.logo_url) : tenant?.logo_url;
  // Logo da BRM para o rodapé
  const brmLogo = isDark ? "/logos/logo-dark.png" : "/logos/logo-light.png";

  return (
    <Sidebar className="border-r border-border/50">
      <SidebarHeader className="p-4 pb-3">
        <div className="flex items-center gap-3 min-h-[56px]">
          {tenantLogo ? (
            <img
              src={tenantLogo}
              alt={tenant?.nome || "AdvogaBRM"}
              className="max-h-14 w-full object-contain object-left"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <>
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
                <Gavel className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-base font-bold leading-tight">{tenant?.nome || "AdvogaBRM"}</h2>
                <p className="text-xs text-muted-foreground">Sistema Jurídico</p>
              </div>
            </>
          )}
        </div>
        {/* Seletor de tenant — apenas SUPER_ADMIN */}
        <TenantSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground uppercase tracking-wider text-xs">
            Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.filter(i => itemVisible(i, role as AppRole | null)).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    className={location.pathname === item.url ? "bg-primary/10 text-primary" : ""}
                  >
                    <Link to={item.url} className="flex items-center gap-3">
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground uppercase tracking-wider text-xs">
            Gestão
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryItems.filter(i => itemVisible(i, role as AppRole | null)).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    className={location.pathname === item.url ? "bg-primary/10 text-primary" : ""}
                  >
                    <Link to={item.url} className="flex items-center gap-3">
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground uppercase tracking-wider text-xs">
            Legal Ops (BPMN)
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {legalopsItems.filter(i => itemVisible(i, role as AppRole | null)).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    className={location.pathname === item.url ? "bg-primary/10 text-primary" : ""}
                  >
                    <Link to={item.url} className="flex items-center gap-3">
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-2">
        <SidebarMenuButton asChild>
          <Link to="/configuracoes" className="flex items-center gap-3 w-full">
            <Settings className="w-4 h-4" />
            <span>Configurações</span>
          </Link>
        </SidebarMenuButton>

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-2 px-2 truncate">{user?.email}</p>
          <Button
            variant="ghost"
            onClick={signOut}
            className="w-full justify-start h-8 px-2"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>

        {/* Powered by BRM Solutions */}
        <div className="pt-2 border-t flex items-center justify-center gap-1.5 opacity-50 hover:opacity-80 transition-opacity">
          <img
            src={brmLogo}
            alt="BRM Solutions"
            className="h-4 w-auto object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            Powered by BRM Solutions
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
