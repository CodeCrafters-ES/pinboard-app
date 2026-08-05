export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      chat_direct_pairs: {
        Row: {
          chat_id: string
          user_a: string
          user_b: string
        }
        Insert: {
          chat_id: string
          user_a: string
          user_b: string
        }
        Update: {
          chat_id?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_direct_pairs_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: true
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          chat_id: string
          joined_at: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          chat_id: string
          joined_at?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          joined_at?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          created_at: string
          id: string
          is_group: boolean
          last_message_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_group?: boolean
          last_message_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_group?: boolean
          last_message_at?: string
        }
        Relationships: []
      }
      engagement_sessions: {
        Row: {
          device: string | null
          focused_seconds: number
          id: string
          last_seen_at: string
          link_clicked: boolean
          max_scroll_pct: number
          post_id: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          device?: string | null
          focused_seconds?: number
          id?: string
          last_seen_at?: string
          link_clicked?: boolean
          max_scroll_pct?: number
          post_id: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          device?: string | null
          focused_seconds?: number
          id?: string
          last_seen_at?: string
          link_clicked?: boolean
          max_scroll_pct?: number
          post_id?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_sessions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_engagement_metrics"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "engagement_sessions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          all_day: boolean
          author_id: string | null
          color_tag: Database["public"]["Enums"]["event_color"]
          created_at: string
          description: string | null
          event_end_at: string
          event_start_at: string
          id: string
          image_url: string | null
          location: string | null
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          author_id?: string | null
          color_tag?: Database["public"]["Enums"]["event_color"]
          created_at?: string
          description?: string | null
          event_end_at: string
          event_start_at: string
          id?: string
          image_url?: string | null
          location?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          author_id?: string | null
          color_tag?: Database["public"]["Enums"]["event_color"]
          created_at?: string
          description?: string | null
          event_end_at?: string
          event_start_at?: string
          id?: string
          image_url?: string | null
          location?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          sender_id: string
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          post_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_engagement_metrics"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_ratings: {
        Row: {
          created_at: string
          post_id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_ratings_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_engagement_metrics"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "post_ratings_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          post_id: string
          type: Database["public"]["Enums"]["reaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          type: Database["public"]["Enums"]["reaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          type?: Database["public"]["Enums"]["reaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_engagement_metrics"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string | null
          cover_image_url: string | null
          created_at: string
          deleted_at: string | null
          external_url: string
          id: string
          published_at: string | null
          status: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body?: string | null
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          external_url: string
          id?: string
          published_at?: string | null
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string | null
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          external_url?: string
          id?: string
          published_at?: string | null
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string | null
          role: Database["public"]["Enums"]["user_role"]
          surname: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id?: string
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          surname?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          surname?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_receipts_pending: {
        Row: {
          enqueued_at: string
          ticket_id: string
          token: string
          user_id: string
        }
        Insert: {
          enqueued_at?: string
          ticket_id: string
          token: string
          user_id: string
        }
        Update: {
          enqueued_at?: string
          ticket_id?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_receipts_pending_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "push_receipts_pending_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          id: string
          last_seen_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      role_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_role: Database["public"]["Enums"]["user_role"] | null
          id: string
          target_user_id: string | null
          to_role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_role?: Database["public"]["Enums"]["user_role"] | null
          id?: string
          target_user_id?: string | null
          to_role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_role?: Database["public"]["Enums"]["user_role"] | null
          id?: string
          target_user_id?: string | null
          to_role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_audit_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_audit_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      messages_public_v: {
        Row: {
          chat_id: string | null
          content: string | null
          created_at: string | null
          deleted_at: string | null
          edited_at: string | null
          id: string | null
          sender_id: string | null
        }
        Relationships: []
      }
      my_chats_v: {
        Row: {
          chat_id: string | null
          is_group: boolean | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_sender_id: string | null
          last_read_at: string | null
          partner_avatar_url: string | null
          partner_name: string | null
          partner_user_id: string | null
          unread_count: number | null
        }
        Relationships: []
      }
      post_engagement_daily: {
        Row: {
          avg_rating: number | null
          avg_scroll: number | null
          avg_seconds: number | null
          click_rate: number | null
          day: string | null
          engaged_users: number | null
          post_id: string | null
          total_comments: number | null
          total_ratings: number | null
          total_reactions: number | null
          unique_clicks: number | null
          unique_readers: number | null
        }
        Relationships: []
      }
      post_engagement_metrics: {
        Row: {
          avg_rating: number | null
          avg_scroll: number | null
          avg_seconds: number | null
          click_rate: number | null
          engaged_users: number | null
          post_id: string | null
          total_comments: number | null
          total_ratings: number | null
          total_reactions: number | null
          unique_clicks: number | null
          unique_readers: number | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string | null
          name: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          surname: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: never
          id?: string | null
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          surname?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: never
          id?: string | null
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          surname?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_engagement_events: {
        Args: { p_events: Json; p_user_id: string }
        Returns: {
          focused_seconds: number
          link_clicked: boolean
          max_scroll_pct: number
          post_id: string
          status: string
        }[]
      }
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      create_or_get_direct_chat: {
        Args: { other_user: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_chat_participant: { Args: { p_chat_id: string }; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      refresh_post_engagement_daily: { Args: never; Returns: undefined }
    }
    Enums: {
      event_color: "brown" | "sea" | "sage" | "amber" | "parchment"
      reaction_type: "like" | "dislike" | "love"
      user_role: "staff" | "manager" | "admin"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      event_color: ["brown", "sea", "sage", "amber", "parchment"],
      reaction_type: ["like", "dislike", "love"],
      user_role: ["staff", "manager", "admin"],
    },
  },
} as const

