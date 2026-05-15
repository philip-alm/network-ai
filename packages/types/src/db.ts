export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      assets: {
        Row: {
          availability: string | null;
          contact_id: string | null;
          created_at: string;
          deleted_at: string | null;
          description: string;
          embedding: unknown;
          embedding_generated_at: string | null;
          embedding_model: string | null;
          fts: unknown;
          id: string;
          name: string;
          tags: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          availability?: string | null;
          contact_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          embedding?: unknown;
          embedding_generated_at?: string | null;
          embedding_model?: string | null;
          fts?: unknown;
          id?: string;
          name: string;
          tags?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          availability?: string | null;
          contact_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          embedding?: unknown;
          embedding_generated_at?: string | null;
          embedding_model?: string | null;
          fts?: unknown;
          id?: string;
          name?: string;
          tags?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assets_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_messages: {
        Row: {
          content: Json;
          created_at: string;
          id: string;
          role: string;
          thread_id: string;
          user_id: string;
        };
        Insert: {
          content: Json;
          created_at?: string;
          id?: string;
          role: string;
          thread_id: string;
          user_id?: string;
        };
        Update: {
          content?: Json;
          created_at?: string;
          id?: string;
          role?: string;
          thread_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_thread_id_fkey';
            columns: ['thread_id'];
            isOneToOne: false;
            referencedRelation: 'chat_threads';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_threads: {
        Row: {
          created_at: string;
          id: string;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          city: string | null;
          created_at: string;
          deleted_at: string | null;
          embedding: unknown;
          embedding_generated_at: string | null;
          embedding_model: string | null;
          fts: unknown;
          id: string;
          name: string;
          notes: string;
          tags: string[];
          updated_at: string;
          user_id: string;
          warmth: number | null;
        };
        Insert: {
          city?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          embedding?: unknown;
          embedding_generated_at?: string | null;
          embedding_model?: string | null;
          fts?: unknown;
          id?: string;
          name: string;
          notes?: string;
          tags?: string[];
          updated_at?: string;
          user_id?: string;
          warmth?: number | null;
        };
        Update: {
          city?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          embedding?: unknown;
          embedding_generated_at?: string | null;
          embedding_model?: string | null;
          fts?: unknown;
          id?: string;
          name?: string;
          notes?: string;
          tags?: string[];
          updated_at?: string;
          user_id?: string;
          warmth?: number | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      asset_fts: {
        Args: {
          p_availability: string;
          p_description: string;
          p_name: string;
          p_tags: string[];
        };
        Returns: unknown;
      };
      contact_fts: {
        Args: {
          p_city: string;
          p_name: string;
          p_notes: string;
          p_tags: string[];
        };
        Returns: unknown;
      };
      delete_embedding_job: { Args: { p_msg_id: number }; Returns: boolean };
      embedding_queue_depth: { Args: never; Returns: number };
      embedding_queue_depth_for_user: {
        Args: { p_user_id: string };
        Returns: number;
      };
      hybrid_search_assets: {
        Args: {
          full_text_weight?: number;
          match_count?: number;
          query_embedding: unknown;
          query_text: string;
          required_tags?: string[];
          rrf_k?: number;
          semantic_weight?: number;
        };
        Returns: {
          availability: string | null;
          contact_id: string | null;
          created_at: string;
          deleted_at: string | null;
          description: string;
          embedding: unknown;
          embedding_generated_at: string | null;
          embedding_model: string | null;
          fts: unknown;
          id: string;
          name: string;
          tags: string[];
          updated_at: string;
          user_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'assets';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      hybrid_search_contacts: {
        Args: {
          full_text_weight?: number;
          match_count?: number;
          min_warmth?: number;
          query_embedding: unknown;
          query_text: string;
          required_tags?: string[];
          rrf_k?: number;
          semantic_weight?: number;
        };
        Returns: {
          city: string | null;
          created_at: string;
          deleted_at: string | null;
          embedding: unknown;
          embedding_generated_at: string | null;
          embedding_model: string | null;
          fts: unknown;
          id: string;
          name: string;
          notes: string;
          tags: string[];
          updated_at: string;
          user_id: string;
          warmth: number | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'contacts';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      mutate_sql: { Args: { query: string }; Returns: Json };
      query_sql: { Args: { query: string }; Returns: Json };
      find_anything: {
        Args: {
          query_terms?: string[] | null;
          query_embedding?: unknown;
          regex_pattern?: string | null;
          in_contacts?: boolean;
          in_assets?: boolean;
          required_tags?: string[] | null;
          any_tags?: string[] | null;
          min_warmth?: number | null;
          max_warmth?: number | null;
          city_filter?: string | null;
          contains_filter?: string | null;
          has_assets?: boolean | null;
          recent_days?: number | null;
          match_count?: number;
        };
        Returns: Json;
      };
      read_embedding_jobs: {
        Args: { p_qty?: number; p_vt?: number };
        Returns: {
          message: Json;
          msg_id: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
