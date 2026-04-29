import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Palette, Image as ImageIcon, Save, Sun, Moon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenant, type Tenant } from "@/contexts/TenantContext";

export function TenantConfig() {
  const { tenant: myTenant, role, refreshTenant } = useTenant();

  // SUPER_ADMIN pode escolher qualquer tenant; MASTER edita só o seu
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);

  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [logoLightFile, setLogoLightFile] = useState<File | null>(null);
  const [logoDarkFile, setLogoDarkFile] = useState<File | null>(null);

  // ── Hooks sempre antes de qualquer return ──────────────────────

  // Carrega lista de tenants para SUPER_ADMIN
  useEffect(() => {
    if (role !== "SUPER_ADMIN" && role !== "MASTER") return;

    if (role === "SUPER_ADMIN") {
      supabase
        .from("tenants")
        .select("id, nome, logo_url, logo_url_dark, primary_color_hex")
        .order("nome")
        .then(({ data }) => {
          if (data) setAllTenants(data as Tenant[]);
        });
    } else if (myTenant) {
      setAllTenants([myTenant]);
    }
  }, [role, myTenant]);

  // Define o tenant ativo quando mudar a lista ou a seleção
  useEffect(() => {
    if (allTenants.length === 0) return;

    const target = selectedTenantId
      ? allTenants.find((t) => t.id === selectedTenantId) ?? allTenants[0]
      : allTenants[0];

    setActiveTenant(target);
    setSelectedTenantId(target.id);
    setNome(target.nome ?? "");
    setPrimaryColor(target.primary_color_hex ?? "#2563eb");
    setLogoLightFile(null);
    setLogoDarkFile(null);
  }, [allTenants, selectedTenantId]);

  // ── Guards depois dos hooks ────────────────────────────────────
  if (role !== "MASTER" && role !== "SUPER_ADMIN") return null;
  if (!activeTenant) return null;

  // ── Helpers ───────────────────────────────────────────────────
  async function uploadLogo(file: File, suffix: "light" | "dark"): Promise<string> {
    const ext = file.name.split(".").pop();
    const fileName = `${activeTenant!.id}-logo-${suffix}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("tenant_assets")
      .upload(fileName, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("tenant_assets").getPublicUrl(fileName);
    return data.publicUrl;
  }

  async function handleSave() {
    setLoading(true);
    try {
      let logoUrl = activeTenant!.logo_url;
      let logoDarkUrl = activeTenant!.logo_url_dark;

      if (logoLightFile) logoUrl = await uploadLogo(logoLightFile, "light");
      if (logoDarkFile) logoDarkUrl = await uploadLogo(logoDarkFile, "dark");

      const { error } = await supabase
        .from("tenants")
        .update({ nome, primary_color_hex: primaryColor, logo_url: logoUrl, logo_url_dark: logoDarkUrl })
        .eq("id", activeTenant!.id);

      if (error) throw error;

      toast.success("Identidade Visual atualizada!");
      // Recarrega o contexto só se for o tenant do próprio usuário
      if (activeTenant!.id === myTenant?.id) await refreshTenant();

      // Atualiza lista local
      setAllTenants((prev) =>
        prev.map((t) =>
          t.id === activeTenant!.id
            ? { ...t, nome, primary_color_hex: primaryColor, logo_url: logoUrl ?? null, logo_url_dark: logoDarkUrl ?? null }
            : t
        )
      );
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <Card className="border-primary/20">
      <CardHeader className="p-4 sm:p-6 bg-primary/5 rounded-t-xl">
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2 text-primary">
          <Palette className="h-5 w-5" /> Identidade Visual do Escritório
        </CardTitle>
        <CardDescription className="text-sm">
          {role === "SUPER_ADMIN"
            ? "Como SUPER ADMIN, você pode editar qualquer escritório."
            : "Altere a marca e as cores do seu escritório."}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-5">

        {/* Seletor de escritório — só para SUPER_ADMIN */}
        {role === "SUPER_ADMIN" && allTenants.length > 1 && (
          <div className="space-y-2">
            <Label>Editar Escritório</Label>
            <Select
              value={selectedTenantId}
              onValueChange={(val) => {
                setSelectedTenantId(val);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um escritório..." />
              </SelectTrigger>
              <SelectContent>
                {allTenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Nome */}
        <div className="space-y-2">
          <Label>Nome do Escritório</Label>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Silva & Associados"
          />
        </div>

        {/* Cor primária */}
        <div className="space-y-2">
          <Label>Cor Primária</Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-10 w-12 rounded cursor-pointer border bg-background"
            />
            <Input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="uppercase font-mono"
              maxLength={7}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Aplicada nos menus, botões e realces do sistema.
          </p>
        </div>

        {/* Logos — dois uploads */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Logo Tema Claro */}
          <div className="space-y-2 border rounded-lg p-4">
            <Label className="flex items-center gap-1">
              <Sun className="w-4 h-4" /> Logo — Tema Claro
            </Label>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={(e) => setLogoLightFile(e.target.files?.[0] || null)}
            />
            <div className="mt-2 h-20 rounded-lg bg-white border flex items-center justify-center overflow-hidden">
              {logoLightFile ? (
                <img src={URL.createObjectURL(logoLightFile)} className="max-h-16 object-contain" />
              ) : activeTenant.logo_url ? (
                <img src={activeTenant.logo_url} className="max-h-16 object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">Sem logo</span>
              )}
            </div>
          </div>

          {/* Logo Tema Escuro */}
          <div className="space-y-2 border rounded-lg p-4">
            <Label className="flex items-center gap-1">
              <Moon className="w-4 h-4" /> Logo — Tema Escuro
            </Label>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={(e) => setLogoDarkFile(e.target.files?.[0] || null)}
            />
            <div className="mt-2 h-20 rounded-lg bg-gray-900 border flex items-center justify-center overflow-hidden">
              {logoDarkFile ? (
                <img src={URL.createObjectURL(logoDarkFile)} className="max-h-16 object-contain" />
              ) : activeTenant.logo_url_dark ? (
                <img src={activeTenant.logo_url_dark} className="max-h-16 object-contain" />
              ) : (
                <span className="text-xs text-gray-400">Sem logo</span>
              )}
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {loading ? "Salvando..." : "Salvar Configurações Visuais"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
