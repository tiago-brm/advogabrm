import { supabase } from "@/integrations/supabase/client";

export interface ParteProcesso {
  nome: string;
  tipo?: string;
}

export interface ConflictResult {
  nomeParteProcesso: string;
  tipoParteProcesso: string;
  nomeMatch: string;
  matchTipo: "cliente" | "equipe";
  matchId: string;
}

// Normaliza um nome para comparação: lowercase sem acentos
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// Retorna true se os dois nomes têm sobreposição significativa
// Estratégia: um nome contém o outro, ou compartilham >= 2 palavras de 4+ letras
function nomesBatem(a: string, b: string): boolean {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (na.length < 4 || nb.length < 4) return false;
  if (na.includes(nb) || nb.includes(na)) return true;

  const palavrasA = na.split(/\s+/).filter((p) => p.length >= 4);
  const palavrasB = new Set(nb.split(/\s+/).filter((p) => p.length >= 4));
  const intersecao = palavrasA.filter((p) => palavrasB.has(p));
  return intersecao.length >= 2;
}

export async function verificarConflitos(
  partes: ParteProcesso[]
): Promise<ConflictResult[]> {
  if (!partes.length) return [];

  const [clientesRes, equipeRes] = await Promise.all([
    supabase.from("clientes").select("id, nome").eq("status", "Ativo"),
    supabase.from("equipe").select("id, nome").eq("status", "Ativo"),
  ]);

  const clientes = clientesRes.data ?? [];
  const equipe = equipeRes.data ?? [];

  const conflitos: ConflictResult[] = [];

  for (const parte of partes) {
    if (!parte.nome || parte.nome.length < 4) continue;

    for (const cliente of clientes) {
      if (nomesBatem(parte.nome, cliente.nome)) {
        conflitos.push({
          nomeParteProcesso: parte.nome,
          tipoParteProcesso: parte.tipo ?? "Parte",
          nomeMatch: cliente.nome,
          matchTipo: "cliente",
          matchId: cliente.id,
        });
      }
    }

    for (const membro of equipe) {
      if (nomesBatem(parte.nome, membro.nome)) {
        conflitos.push({
          nomeParteProcesso: parte.nome,
          tipoParteProcesso: parte.tipo ?? "Parte",
          nomeMatch: membro.nome,
          matchTipo: "equipe",
          matchId: membro.id,
        });
      }
    }
  }

  // Remove duplicatas pelo par (nomeParteProcesso + matchId)
  const vistos = new Set<string>();
  return conflitos.filter((c) => {
    const key = `${normalizar(c.nomeParteProcesso)}|${c.matchId}`;
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}
