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
import { useLogo } from "@/hooks/useLogo";
import { Button } from "@/components/ui/button";
const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
  },
  {
    title: "Clientes",
    url: "/clientes",
    icon: Users,
  },
  {
    title: "Processos",
    url: "/processos",
    icon: Briefcase,
  },
  {
    title: "Consulta Datajud",
    url: "/consulta-processos",
    icon: Search,
  },
  {
    title: "Audiências",
    url: "/audiencias",
    icon: Calendar,
  },
  {
    title: "Tarefas",
    url: "/tarefas",
    icon: Clock,
  },
  {
    title: "Documentos",
    url: "/documentos",
    icon: FileText,
  },
];
const secondaryItems = [
  {
    title: "Agenda",
    url: "/agenda",
    icon: CalendarDays,
  },
  {
    title: "Equipe",
    url: "/equipe",
    icon: UserCheck,
  },
  {
    title: "Financeiro",
    url: "/financeiro",
    icon: DollarSign,
  },
  {
    title: "Relatórios",
    url: "/relatorios",
    icon: BarChart3,
  },
  {
    title: "Mensagens",
    url: "/mensagens",
    icon: MessageSquare,
  },
];
export function AppSidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { tenant } = useTenant();
  const logoSrc = useLogo(tenant?.logo_url);

  const handleSignOut = async () => {
    await signOut();
  };
  return (
    <Sidebar className="border-r border-border/50">
      <SidebarHeader className="p-6">
        <div className="flex items-center gap-3">
          {logoSrc ? (
            <img 
              src={logoSrc} 
              alt={tenant?.nome || "AdvogaBRM"} 
              className="max-h-12 w-auto object-contain"
              onError={(e) => {
                // Se a imagem não carregar (ex: logo ainda não colocada na pasta),
                // esconde e mostra o fallback com ícone
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <>
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
                <Gavel className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight">{tenant?.nome || "AdvogaBRM"}</h2>
                <p className="text-xs text-muted-foreground">Sistema Jurídico</p>
              </div>
            </>
          )}
        </div>
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
                    className={
                      location.pathname === item.url
                        ? "bg-primary/10 text-primary"
                        : ""
                    }
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
                    className={
                      location.pathname === item.url
                        ? "bg-primary/10 text-primary"
                        : ""
                    }
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
          <p className="text-xs text-muted-foreground mb-2 px-2">
            {user?.email}
          </p>
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="w-full justify-start h-8 px-2"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
