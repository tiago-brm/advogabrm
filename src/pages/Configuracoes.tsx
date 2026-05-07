import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, Key, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SmtpConfig } from "@/components/SmtpConfig";
import { LlmConfig } from "@/components/LlmConfig";
import { TenantConfig } from "@/components/TenantConfig";
import { SuperAdminTenants } from "@/components/SuperAdminTenants";

type Template = {
  id: string;
  title: string;
  content: string;
  is_default: boolean;
  user_id: string | null;
};

const Configuracoes: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [newTemplateContent, setNewTemplateContent] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      setCurrentUserId(uid);

      const { data, error } = await supabase
        .from("message_templates")
        .select("id, title, content, is_default, user_id")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        toast({
          title: "Erro",
          description: "Não foi possível carregar os modelos.",
          variant: "destructive",
        });
        return;
      }
      setTemplates((data || []) as Template[]);
    };
    load();
  }, [toast]);

  const handleCreateNewTemplate = async () => {
    if (!newTemplateTitle.trim() || !newTemplateContent.trim()) {
      toast({
        title: "Erro",
        description: "Título e conteúdo são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      toast({
        title: "Erro",
        description: "Usuário não autenticado.",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await supabase
      .from("message_templates")
      .insert({
        title: newTemplateTitle,
        content: newTemplateContent,
        user_id: uid,
        is_default: false,
      })
      .select("id, title, content, is_default, user_id")
      .single();

    if (error) {
      console.error(error);
      toast({
        title: "Erro",
        description: "Falha ao criar modelo.",
        variant: "destructive",
      });
      return;
    }

    setTemplates((prev) => [data as Template, ...prev]);
    setNewTemplateTitle("");
    setNewTemplateContent("");
    setIsDialogOpen(false);
    toast({
      title: "Sucesso!",
      description: "Novo modelo de mensagem criado.",
    });
  };

  const handleDeleteTemplate = async (id: string) => {
    const tmpl = templates.find((t) => t.id === id);
    if (!tmpl) return;
    if (tmpl.is_default || (tmpl.user_id && tmpl.user_id !== currentUserId)) {
      toast({
        title: "Ação não permitida",
        description: "Você só pode remover seus próprios modelos.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from("message_templates")
      .delete()
      .eq("id", id);
    if (error) {
      console.error(error);
      toast({
        title: "Erro",
        description: "Falha ao remover modelo.",
        variant: "destructive",
      });
      return;
    }

    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast({ title: "Sucesso!", description: "Modelo de mensagem removido." });
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      toast({
        title: "Erro",
        description: "Todos os campos são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Erro",
        description: "A nova senha e a confirmação não coincidem.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Erro",
        description: "A nova senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      console.error(error);
      toast({
        title: "Erro",
        description: "Falha ao alterar senha: " + error.message,
        variant: "destructive",
      });
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setIsPasswordDialogOpen(false);
    toast({ title: "Sucesso!", description: "Senha alterada com sucesso." });
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold mb-4">Configurações</h1>

      {/* Gerenciamento de Escritórios (Apenas Super Admin) */}
      <SuperAdminTenants />

      {/* Seção de Identidade Visual (apenas Master) */}
      <TenantConfig />

      {/* Seção de Segurança */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <CardTitle className="text-lg sm:text-xl">Segurança</CardTitle>
              <CardDescription className="text-sm">
                Gerencie suas configurações de segurança.
              </CardDescription>
            </div>
            <Dialog
              open={isPasswordDialogOpen}
              onOpenChange={setIsPasswordDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto text-sm">
                  <Key className="mr-2 h-4 w-4" /> Alterar Senha
                </Button>
              </DialogTrigger>
              <DialogContent className="mx-4 max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-lg sm:text-xl">
                    Alterar Senha
                  </DialogTitle>
                  <DialogDescription className="text-sm">
                    Digite sua nova senha. Ela deve ter pelo menos 6 caracteres.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                    <Label
                      htmlFor="new-password"
                      className="text-sm font-medium sm:text-right"
                    >
                      Nova Senha
                    </Label>
                    <div className="relative sm:col-span-3">
                      <Input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="text-sm pr-10"
                        placeholder="Digite sua nova senha"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                    <Label
                      htmlFor="confirm-password"
                      className="text-sm font-medium sm:text-right"
                    >
                      Confirmar Senha
                    </Label>
                    <div className="relative sm:col-span-3">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="text-sm pr-10"
                        placeholder="Confirme sua nova senha"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsPasswordDialogOpen(false)}
                    className="w-full sm:w-auto text-sm"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleChangePassword}
                    className="w-full sm:w-auto text-sm"
                  >
                    Alterar Senha
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Seção de SMTP */}
      <SmtpConfig />

      {/* Seção de Inteligência Artificial */}
      <LlmConfig />

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <CardTitle className="text-lg sm:text-xl">
                Modelos de Mensagem
              </CardTitle>
              <CardDescription className="text-sm">
                Gerencie os modelos de mensagem para envio rápido.
              </CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto text-sm">
                  <PlusCircle className="mr-2 h-4 w-4" /> Criar Novo Modelo
                </Button>
              </DialogTrigger>
              <DialogContent className="mx-4 max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-lg sm:text-xl">
                    Criar Novo Modelo
                  </DialogTitle>
                  <DialogDescription className="text-sm">
                    Use variáveis com colchetes, como [nome_cliente].
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                    <Label
                      htmlFor="new-template-title"
                      className="text-sm font-medium sm:text-right"
                    >
                      Título
                    </Label>
                    <Input
                      id="new-template-title"
                      value={newTemplateTitle}
                      onChange={(e) => setNewTemplateTitle(e.target.value)}
                      className="sm:col-span-3 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                    <Label
                      htmlFor="new-template-content"
                      className="text-sm font-medium sm:text-right"
                    >
                      Conteúdo
                    </Label>
                    <Textarea
                      id="new-template-content"
                      value={newTemplateContent}
                      onChange={(e) => setNewTemplateContent(e.target.value)}
                      className="sm:col-span-3 text-sm"
                      placeholder="Ex: Olá [nome_cliente], o status do seu processo [numero_processo] foi atualizado."
                    />
                  </div>
                </div>
                <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button
                    onClick={handleCreateNewTemplate}
                    className="w-full sm:w-auto text-sm"
                  >
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-3 sm:space-y-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 rounded-lg border space-y-2 sm:space-y-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm sm:text-base font-semibold">
                    {template.title}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground break-words">
                    {template.content}
                  </p>
                </div>
                {!template.is_default && template.user_id === currentUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="self-end sm:self-center ml-auto sm:ml-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Apagar</span>
                  </Button>
                )}
              </div>
            ))}
            {templates.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum modelo cadastrado.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Configuracoes;
