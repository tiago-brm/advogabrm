import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function SmtpConfig() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [smtp, setSmtp] = useState({
    host: "",
    port: 587,
    username: "",
    password: "",
    secure: false,
    from_name: "",
    from_email: ""
  });

  useEffect(() => {
    async function loadSmtp() {
      if (!user) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("user_smtp_configs")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setSmtp({
          host: data.host,
          port: data.port,
          username: data.username,
          password: data.password,
          secure: data.secure,
          from_name: data.from_name,
          from_email: data.from_email
        });
      }
      setLoading(false);
    }
    loadSmtp();
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_smtp_configs")
        .upsert({
          user_id: user.id,
          ...smtp
        });
        
      if (error) throw error;
      toast.success("Configurações SMTP salvas com sucesso!");
    } catch (err: any) {
      toast.error(`Erro ao salvar SMTP: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
          <Mail className="h-5 w-5" /> Configurações de E-mail (SMTP)
        </CardTitle>
        <CardDescription className="text-sm">
          Configure seu provedor de e-mail para permitir que o sistema faça disparos automáticos para você.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Servidor SMTP (Host)</Label>
                <Input 
                  placeholder="Ex: smtp.gmail.com" 
                  value={smtp.host}
                  onChange={e => setSmtp({...smtp, host: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Porta</Label>
                <Input 
                  type="number" 
                  placeholder="587" 
                  value={smtp.port}
                  onChange={e => setSmtp({...smtp, port: parseInt(e.target.value, 10)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Usuário de Autenticação</Label>
                <Input 
                  placeholder="seuemail@gmail.com" 
                  value={smtp.username}
                  onChange={e => setSmtp({...smtp, username: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Senha / App Password</Label>
                <Input 
                  type="password" 
                  placeholder="Sua senha ou senha de app" 
                  value={smtp.password}
                  onChange={e => setSmtp({...smtp, password: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Nome do Remetente</Label>
                <Input 
                  placeholder="Dr. João Silva" 
                  value={smtp.from_name}
                  onChange={e => setSmtp({...smtp, from_name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail do Remetente</Label>
                <Input 
                  placeholder="contato@joaosilva.adv.br" 
                  value={smtp.from_email}
                  onChange={e => setSmtp({...smtp, from_email: e.target.value})}
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between border p-3 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-sm">Conexão Segura (SSL/TLS)</Label>
                <p className="text-xs text-muted-foreground">
                  Marque se a porta for 465 (SSL). Deixe desmarcado para 587 (StartTLS).
                </p>
              </div>
              <Switch 
                checked={smtp.secure}
                onCheckedChange={checked => setSmtp({...smtp, secure: checked})}
              />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saving ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
