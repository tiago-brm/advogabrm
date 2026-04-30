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
  Eye
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

const menuItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Processos", url: "/processos", icon: Briefcase },
  { title: "Consulta Datajud", url: "/consulta-processos", icon: Search },
  { title: "Monitoramento", url: "/monitoramento", icon: Eye },
  { title: "Audiências", url: "/audiencias", icon: Calendar },
  { title: "Tarefas", url: "/tarefas", icon: Clock },
  { title: "Documentos", url: "/documentos", icon: FileText },
];

const secondaryItems = [
  { title: "Agenda", url: "/agenda", icon: CalendarDays },
  { title: "Equipe", url: "/equipe", icon: UserCheck },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  { title: "Mensagens", url: "/mensagens", icon: MessageSquare },
];

const legalopsItems = [
  { title: "Catálogo", url: "/bpmn/catalogo", icon: Workflow },
  { title: "Minhas Tarefas", url: "/bpmn/tarefas", icon: ListTodo },
  { title: "Modelador BPMN", url: "/admin/bpmn-modeler", icon: Edit3, role: "SUPER_ADMIN" },
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
              {menuItems.map((item) => (
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
              {secondaryItems.map((item) => (
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
              {legalopsItems.map((item) => {
                if (item.role && role !== item.role) return null;
                return (
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
                );
              })}
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
