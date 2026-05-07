import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Loader2, Save, BotMessageSquare, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  type LlmProvider,
  type LlmConfig as LlmConfigType,
  PROVIDER_MODELS,
  PROVIDER_LABELS,
  DEFAULT_BASE_URLS,
  testLlmConnection,
} from "@/services/llmService";

const PROVIDERS: LlmProvider[] = ["openai", "anthropic", "google", "openrouter"];

export function LlmConfig() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null);
  const [showKey, setShowKey] = useState(false);

  const [cfg, setCfg] = useState<LlmConfigType>({
    provider: "openai",
    apiKey: "",
    model: "gpt-4o-mini",
    baseUrl: "",
  });

  useEffect(() => {
    async function load() {
      if (!user) return;
      setLoading(true);
      const { data } = await supabase
        .from("user_llm_configs")
        .select("provider, api_key, model, base_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setCfg({
          provider: data.provider as LlmProvider,
          apiKey: data.api_key,
          model: data.model,
          baseUrl: data.base_url ?? "",
        });
      }
      setLoading(false);
    }
    load();
  }, [user]);

  function handleProviderChange(provider: LlmProvider) {
    const defaultModel = PROVIDER_MODELS[provider][0]?.value ?? "";
    setCfg((prev) => ({
      ...prev,
      provider,
      model: defaultModel,
      baseUrl: provider === "openrouter" ? DEFAULT_BASE_URLS.openrouter : "",
    }));
    setTestResult(null);
  }

  async function handleTest() {
    if (!cfg.apiKey.trim()) {
      toast.error("Informe a chave de API antes de testar.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await testLlmConnection(cfg);
      setTestResult("ok");
      toast.success("Conexão bem-sucedida!");
    } catch (err: any) {
      setTestResult("error");
      toast.error(`Falha na conexão: ${err.message}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!user) return;
    if (!cfg.apiKey.trim()) {
      toast.error("A chave de API é obrigatória.");
      return;
    }
    if (!cfg.model.trim()) {
      toast.error("Selecione ou informe um modelo.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("user_llm_configs").upsert({
        user_id: user.id,
        provider: cfg.provider,
        api_key: cfg.apiKey,
        model: cfg.model,
        base_url: cfg.baseUrl || null,
        is_active: true,
      });
      if (error) throw error;
      toast.success("Configuração de IA salva com sucesso!");
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  const models = PROVIDER_MODELS[cfg.provider];
  const isOpenRouter = cfg.provider === "openrouter";

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
          <BotMessageSquare className="h-5 w-5" /> Inteligência Artificial
        </CardTitle>
        <CardDescription className="text-sm">
          Configure seu provedor de IA. A chave será usada para resumir processos,
          gerar documentos e outras funcionalidades inteligentes do sistema.
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
              {/* Provedor */}
              <div className="space-y-2">
                <Label>Provedor</Label>
                <Select
                  value={cfg.provider}
                  onValueChange={(v) => handleProviderChange(v as LlmProvider)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PROVIDER_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Modelo */}
              <div className="space-y-2">
                <Label>Modelo</Label>
                {models.length > 0 ? (
                  <Select
                    value={cfg.model}
                    onValueChange={(v) => setCfg((prev) => ({ ...prev, model: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Ex: openai/gpt-4o ou meta-llama/llama-3.1-8b-instruct"
                    value={cfg.model}
                    onChange={(e) => setCfg((prev) => ({ ...prev, model: e.target.value }))}
                  />
                )}
              </div>

              {/* Chave de API */}
              <div className="space-y-2 sm:col-span-2">
                <Label>Chave de API</Label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    placeholder={
                      cfg.provider === "anthropic"
                        ? "sk-ant-..."
                        : cfg.provider === "google"
                        ? "AIza..."
                        : cfg.provider === "openrouter"
                        ? "sk-or-..."
                        : "sk-..."
                    }
                    value={cfg.apiKey}
                    onChange={(e) => {
                      setCfg((prev) => ({ ...prev, apiKey: e.target.value }));
                      setTestResult(null);
                    }}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowKey((v) => !v)}
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              {/* URL Base — apenas OpenRouter */}
              {isOpenRouter && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>URL Base</Label>
                  <Input
                    placeholder="https://openrouter.ai/api/v1"
                    value={cfg.baseUrl}
                    onChange={(e) => setCfg((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Deixe o padrão para usar o OpenRouter. Altere apenas se usar um proxy próprio.
                  </p>
                </div>
              )}
            </div>

            {/* Resultado do teste */}
            {testResult === "ok" && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Conexão validada com sucesso.
              </div>
            )}
            {testResult === "error" && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="h-4 w-4" />
                Falha na conexão. Verifique a chave e o modelo.
              </div>
            )}

            {/* Ações */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testing || saving}
                className="w-full sm:w-auto"
              >
                {testing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : testResult === "ok" ? (
                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                ) : (
                  <BotMessageSquare className="mr-2 h-4 w-4" />
                )}
                {testing ? "Testando..." : "Testar conexão"}
              </Button>

              <Button
                onClick={handleSave}
                disabled={saving || testing}
                className="w-full sm:w-auto"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {saving ? "Salvando..." : "Salvar configuração"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
