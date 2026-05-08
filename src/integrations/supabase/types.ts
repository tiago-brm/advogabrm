export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      rpa_enriquecimento_cache: {
        Row: {
          id: string
          tenant_id: string
          numero_processo: string
          tribunal: string
          resultado: Json
          cached_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          numero_processo: string
          tribunal: string
          resultado: Json
          cached_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          numero_processo?: string
          tribunal?: string
          resultado?: Json
          cached_at?: string
        }
        Relationships: []
      }
      audiencias: {
        Row: {
          created_at: string
          data: string
          hora: string
          id: string
          local: string
          processo_id: string | null
          processo_numero: string
          status: Database["public"]["Enums"]["audiencia_status"]
          tipo: Database["public"]["Enums"]["audiencia_tipo"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: string
          hora: string
          id?: string
          local: string
          processo_id?: string | null
          processo_numero: string
          status?: Database["public"]["Enums"]["audiencia_status"]
          tipo: Database["public"]["Enums"]["audiencia_tipo"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: string
          hora?: string
          id?: string
          local?: string
          processo_id?: string | null
          processo_numero?: string
          status?: Database["public"]["Enums"]["audiencia_status"]
          tipo?: Database["public"]["Enums"]["audiencia_tipo"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audiencias_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiencias_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf_cnpj: string | null
          created_at: string
          data_nascimento: string | null
          data_registro: string
          email: string
          endereco: string | null
          estado: string | null
          id: string
          logradouro: string | null
          nome: string
          numero: string | null
          observacoes: string | null
          origem: string | null
          processos_ativos: number
          profissao: string | null
          razao_social: string | null
          rg: string | null
          status: Database["public"]["Enums"]["cliente_status"]
          telefone: string | null
          telefone_secundario: string | null
          tipo_pessoa: string
          ultimo_contato: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_nascimento?: string | null
          data_registro?: string
          email: string
          endereco?: string | null
          estado?: string | null
          id?: string
          logradouro?: string | null
          nome: string
          numero?: string | null
          observacoes?: string | null
          origem?: string | null
          processos_ativos?: number
          profissao?: string | null
          razao_social?: string | null
          rg?: string | null
          status?: Database["public"]["Enums"]["cliente_status"]
          telefone?: string | null
          telefone_secundario?: string | null
          tipo_pessoa?: string
          ultimo_contato?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_nascimento?: string | null
          data_registro?: string
          email?: string
          endereco?: string | null
          estado?: string | null
          id?: string
          logradouro?: string | null
          nome?: string
          numero?: string | null
          observacoes?: string | null
          origem?: string | null
          processos_ativos?: number
          profissao?: string | null
          razao_social?: string | null
          rg?: string | null
          status?: Database["public"]["Enums"]["cliente_status"]
          telefone?: string | null
          telefone_secundario?: string | null
          tipo_pessoa?: string
          ultimo_contato?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_interacoes: {
        Row: {
          id: string
          cliente_id: string
          user_id: string
          tipo: string
          descricao: string
          data_interacao: string
          created_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          user_id: string
          tipo: string
          descricao: string
          data_interacao?: string
          created_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          user_id?: string
          tipo?: string
          descricao?: string
          data_interacao?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_interacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_interacoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          cliente_id: string | null
          created_at: string
          id: string
          nome: string
          processo_id: string | null
          storage_path: string
          tamanho: number | null
          user_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          id?: string
          nome: string
          processo_id?: string | null
          storage_path: string
          tamanho?: number | null
          user_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          id?: string
          nome?: string
          processo_id?: string | null
          storage_path?: string
          tamanho?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_lancamentos: {
        Row: {
          cliente_id: string
          created_at: string
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          id: string
          status: Database["public"]["Enums"]["lancamento_status"]
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento: string
          descricao: string
          id?: string
          status?: Database["public"]["Enums"]["lancamento_status"]
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          id?: string
          status?: Database["public"]["Enums"]["lancamento_status"]
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_lancamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe: {
        Row: {
          id: string
          user_id: string
          tenant_id: string | null
          profile_id: string | null
          nome: string
          email: string
          telefone: string | null
          whatsapp: string | null
          cargo: string
          departamento: string
          nivel_acesso: string | null
          pode_assinar: boolean
          data_admissao: string | null
          salario: number | null
          tipo_contrato: string | null
          status: string
          cpf: string | null
          oab: string | null
          oab_uf: string | null
          data_nascimento: string | null
          cep: string | null
          logradouro: string | null
          numero: string | null
          complemento: string | null
          bairro: string | null
          cidade: string | null
          estado: string | null
          endereco: string | null
          observacoes: string | null
          foto_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tenant_id?: string | null
          profile_id?: string | null
          nome: string
          email: string
          telefone?: string | null
          whatsapp?: string | null
          cargo: string
          departamento: string
          nivel_acesso?: string | null
          pode_assinar?: boolean
          data_admissao?: string | null
          salario?: number | null
          tipo_contrato?: string | null
          status?: string
          cpf?: string | null
          oab?: string | null
          oab_uf?: string | null
          data_nascimento?: string | null
          cep?: string | null
          logradouro?: string | null
          numero?: string | null
          complemento?: string | null
          bairro?: string | null
          cidade?: string | null
          estado?: string | null
          endereco?: string | null
          observacoes?: string | null
          foto_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tenant_id?: string | null
          profile_id?: string | null
          nome?: string
          email?: string
          telefone?: string | null
          whatsapp?: string | null
          cargo?: string
          departamento?: string
          nivel_acesso?: string | null
          pode_assinar?: boolean
          data_admissao?: string | null
          salario?: number | null
          tipo_contrato?: string | null
          status?: string
          cpf?: string | null
          oab?: string | null
          oab_uf?: string | null
          data_nascimento?: string | null
          cep?: string | null
          logradouro?: string | null
          numero?: string | null
          complemento?: string | null
          bairro?: string | null
          cidade?: string | null
          estado?: string | null
          endereco?: string | null
          observacoes?: string | null
          foto_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          is_default: boolean
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_default?: boolean
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_default?: boolean
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      processos: {
        Row: {
          assunto: string
          cliente_id: string
          created_at: string
          data_inicio: string
          data_limite: string | null
          id: string
          instancia: string | null
          numero: string
          prioridade: Database["public"]["Enums"]["processo_prioridade"]
          responsavel: string | null
          status: Database["public"]["Enums"]["processo_status"]
          updated_at: string
          user_id: string
          valor_causa: number | null
        }
        Insert: {
          assunto: string
          cliente_id: string
          created_at?: string
          data_inicio: string
          data_limite?: string | null
          id?: string
          instancia?: string | null
          numero: string
          prioridade?: Database["public"]["Enums"]["processo_prioridade"]
          responsavel?: string | null
          status?: Database["public"]["Enums"]["processo_status"]
          updated_at?: string
          user_id: string
          valor_causa?: number | null
        }
        Update: {
          assunto?: string
          cliente_id?: string
          created_at?: string
          data_inicio?: string
          data_limite?: string | null
          id?: string
          instancia?: string | null
          numero?: string
          prioridade?: Database["public"]["Enums"]["processo_prioridade"]
          responsavel?: string | null
          status?: Database["public"]["Enums"]["processo_status"]
          updated_at?: string
          user_id?: string
          valor_causa?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "processos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          role: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          role?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          created_at: string
          data_conclusao: string
          descricao: string
          id: string
          prioridade: Database["public"]["Enums"]["tarefa_prioridade"]
          responsavel: string
          status: Database["public"]["Enums"]["tarefa_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_conclusao: string
          descricao: string
          id?: string
          prioridade: Database["public"]["Enums"]["tarefa_prioridade"]
          responsavel: string
          status?: Database["public"]["Enums"]["tarefa_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_conclusao?: string
          descricao?: string
          id?: string
          prioridade?: Database["public"]["Enums"]["tarefa_prioridade"]
          responsavel?: string
          status?: Database["public"]["Enums"]["tarefa_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          id: string
          tenant_id: string | null
          name: string
          bpmn_xml: string
          form_schema: Json | null
          version: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          name: string
          bpmn_xml: string
          form_schema?: Json | null
          version?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          name?: string
          bpmn_xml?: string
          form_schema?: Json | null
          version?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      process_instances: {
        Row: {
          id: string
          template_id: string | null
          tenant_id: string
          external_id: string | null
          status: "ACTIVE" | "COMPLETED" | "SUSPENDED" | "TERMINATED"
          started_by: string | null
          started_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          template_id?: string | null
          tenant_id: string
          external_id?: string | null
          status?: "ACTIVE" | "COMPLETED" | "SUSPENDED" | "TERMINATED"
          started_by?: string | null
          started_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          template_id?: string | null
          tenant_id?: string
          external_id?: string | null
          status?: "ACTIVE" | "COMPLETED" | "SUSPENDED" | "TERMINATED"
          started_by?: string | null
          started_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      checklist_templates: {
        Row: {
          id: string
          user_id: string | null
          area: string
          nome: string
          tarefas: Json
          is_global: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          area: string
          nome: string
          tarefas?: Json
          is_global?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          area?: string
          nome?: string
          tarefas?: Json
          is_global?: boolean
          created_at?: string
        }
        Relationships: []
      }
      user_llm_configs: {
        Row: {
          id: string
          user_id: string
          provider: "openai" | "anthropic" | "google" | "openrouter"
          api_key: string
          model: string
          base_url: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: "openai" | "anthropic" | "google" | "openrouter"
          api_key: string
          model: string
          base_url?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: "openai" | "anthropic" | "google" | "openrouter"
          api_key?: string
          model?: string
          base_url?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_llm_configs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          id: string
          process_instance_id: string | null
          tenant_id: string
          external_task_id: string | null
          name: string
          assignee_id: string | null
          form_schema: Json | null
          status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED"
          task_type: "HUMAN" | "RPA" | "API"
          rpa_queue: string | null
          rpa_payload: Json | null
          rpa_result: Json | null
          error_message: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          process_instance_id?: string | null
          tenant_id: string
          external_task_id?: string | null
          name: string
          assignee_id?: string | null
          form_schema?: Json | null
          status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED"
          task_type?: "HUMAN" | "RPA" | "API"
          rpa_queue?: string | null
          rpa_payload?: Json | null
          rpa_result?: Json | null
          error_message?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          process_instance_id?: string | null
          tenant_id?: string
          external_task_id?: string | null
          name?: string
          assignee_id?: string | null
          form_schema?: Json | null
          status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED"
          task_type?: "HUMAN" | "RPA" | "API"
          rpa_queue?: string | null
          rpa_payload?: Json | null
          rpa_result?: Json | null
          error_message?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      audiencia_status: "Agendada" | "Realizada" | "Cancelada" | "Reagendada"
      audiencia_tipo: "Instrução" | "Conciliação" | "Julgamento" | "Una"
      cliente_status: "Ativo" | "Inativo"
      lancamento_status: "Pago" | "Pendente"
      processo_prioridade: "Alta" | "Média" | "Baixa"
      processo_status: "Em Andamento" | "Aguardando" | "Concluído"
      tarefa_prioridade: "Baixa" | "Média" | "Alta"
      tarefa_status: "Pendente" | "Em Andamento" | "Concluída"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audiencia_status: ["Agendada", "Realizada", "Cancelada", "Reagendada"],
      audiencia_tipo: ["Instrução", "Conciliação", "Julgamento", "Una"],
      cliente_status: ["Ativo", "Inativo"],
      lancamento_status: ["Pago", "Pendente"],
      processo_prioridade: ["Alta", "Média", "Baixa"],
      processo_status: ["Em Andamento", "Aguardando", "Concluído"],
      tarefa_prioridade: ["Baixa", "Média", "Alta"],
      tarefa_status: ["Pendente", "Em Andamento", "Concluída"],
    },
  },
} as const
