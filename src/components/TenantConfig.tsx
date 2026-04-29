import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Palette, Image as ImageIcon, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";

export function TenantConfig() {
  const { tenant, role, refreshTenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState(tenant?.nome || "");
  const [primaryColor, setPrimaryColor] = useState(tenant?.primary_color_hex || "#2563eb");
  const [file, setFile] = useState<File | null>(null);

  // Somente MASTER e SUPER_ADMIN podem ver
  if (role !== "MASTER" && role !== "SUPER_ADMIN") {
    return null;
  }

  if (!tenant) return null;

  async function handleSave() {
    setLoading(true);
    try {
      let logoUrl = tenant?.logo_url;

      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${tenant?.id}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("tenant_assets")
          .upload(fileName, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("tenant_assets").getPublicUrl(fileName);
        logoUrl = data.publicUrl;
      }

      const { error } = await supabase
        .from("tenants")
        .update({
          nome,
          primary_color_hex: primaryColor,
          logo_url: logoUrl
        })
        .eq("id", tenant?.id);

      if (error) throw error;

      toast.success("Identidade Visual atualizada com sucesso!");
      await refreshTenant(); // Recarrega para aplicar as cores e logo na hora
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="p-4 sm:p-6 bg-primary/5 rounded-t-xl">
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2 text-primary">
          <Palette className="h-5 w-5" /> Identidade Visual do Escritório
        </CardTitle>
        <CardDescription className="text-sm">
          Apenas usuários MASTER podem alterar a marca e as cores do sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do Escritório</Label>
            <Input 
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Silva & Associados"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
              <Label>Cor Primária (Hexadecimal)</Label>
              <div className="flex gap-2 items-center">
                <input 
                  type="color" 
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  className="h-10 w-12 rounded cursor-pointer border bg-background"
                />
                <Input 
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  className="uppercase"
                />
              </div>
              <p className="text-xs text-muted-foreground">Esta cor será aplicada nos menus, botões e realces.</p>
            </div>

            <div className="space-y-2">
              <Label>Logo do Escritório</Label>
              <div className="flex flex-col gap-2">
                <Input 
                  type="file" 
                  accept="image/*"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
                {(file || tenant.logo_url) && (
                  <div className="mt-2 p-4 border rounded-lg bg-muted/20 flex justify-center items-center">
                    {file ? (
                      <img src={URL.createObjectURL(file)} alt="Preview" className="max-h-16 object-contain" />
                    ) : (
                      <img src={tenant.logo_url!} alt="Logo" className="max-h-16 object-contain" />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="pt-4 flex justify-end">
            <Button onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {loading ? "Salvando..." : "Salvar Configurações Visuais"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
