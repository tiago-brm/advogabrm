import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Building, Plus, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";

export function SuperAdminTenants() {
  const { role } = useTenant();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [novoNome, setNovoNome] = useState("");

  if (role !== "SUPER_ADMIN") return null;

  useEffect(() => {
    fetchTenants();
  }, []);

  async function fetchTenants() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("tenants").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setTenants(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!novoNome.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("tenants").insert({
        nome: novoNome.trim(),
        primary_color_hex: "#2563eb",
      });
      if (error) throw error;
      toast.success("Escritório criado com sucesso!");
      setNovoNome("");
      fetchTenants();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="border-red-500/20">
      <CardHeader className="p-4 sm:p-6 bg-red-500/5 rounded-t-xl">
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2 text-red-600">
          <Building className="h-5 w-5" /> Gestão de Escritórios (Apenas SUPER ADMIN)
        </CardTitle>
        <CardDescription className="text-sm">
          Como dono do sistema, você pode criar e listar todos os escritórios (Tenants) aqui.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-4">
        
        <div className="flex gap-2">
          <Input 
            placeholder="Nome do Novo Escritório" 
            value={novoNome} 
            onChange={e => setNovoNome(e.target.value)}
          />
          <Button onClick={handleCreate} disabled={creating || !novoNome.trim()}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Criar
          </Button>
        </div>

        <div className="space-y-3 mt-4">
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
          ) : (
            tenants.map(t => (
              <div key={t.id} className="p-4 border rounded-lg flex justify-between items-center">
                <div>
                  <h3 className="font-bold">{t.nome}</h3>
                  <p className="text-xs text-muted-foreground">ID: {t.id}</p>
                </div>
                <div className="flex items-center gap-3">
                  {t.logo_url && <img src={t.logo_url} className="h-8 object-contain" alt="Logo" />}
                  <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: t.primary_color_hex }}></div>
                </div>
              </div>
            ))
          )}
        </div>

      </CardContent>
    </Card>
  );
}
