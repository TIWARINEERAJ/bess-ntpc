export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      issues: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          owner: string | null
          resolved_at: string | null
          severity: string
          station_id: string
          status: string
          target_date: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          owner?: string | null
          resolved_at?: string | null
          severity?: string
          station_id: string
          status?: string
          target_date?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          owner?: string | null
          resolved_at?: string | null
          severity?: string
          station_id?: string
          status?: string
          target_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      l2_tasks: {
        Row: {
          baseline_finish: string | null
          baseline_start: string | null
          duration_days: number
          id: string
          is_section: boolean
          name: string
          parent_wbs: string | null
          predecessors: string | null
          sort_order: number
          wbs_code: string
        }
        Insert: {
          baseline_finish?: string | null
          baseline_start?: string | null
          duration_days?: number
          id?: string
          is_section?: boolean
          name: string
          parent_wbs?: string | null
          predecessors?: string | null
          sort_order?: number
          wbs_code: string
        }
        Update: {
          baseline_finish?: string | null
          baseline_start?: string | null
          duration_days?: number
          id?: string
          is_section?: boolean
          name?: string
          parent_wbs?: string | null
          predecessors?: string | null
          sort_order?: number
          wbs_code?: string
        }
        Relationships: []
      }
      station_task_status: {
        Row: {
          actual_finish: string | null
          actual_start: string | null
          id: string
          owner: string | null
          percent_complete: number
          remarks: string | null
          station_id: string
          status: string
          task_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_finish?: string | null
          actual_start?: string | null
          id?: string
          owner?: string | null
          percent_complete?: number
          remarks?: string | null
          station_id: string
          status?: string
          task_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_finish?: string | null
          actual_start?: string | null
          id?: string
          owner?: string | null
          percent_complete?: number
          remarks?: string | null
          station_id?: string
          status?: string
          task_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "station_task_status_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_task_status_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "l2_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          agency: string | null
          agency_contacts: Json | null
          capacity_mw: number | null
          capacity_mwh: number
          created_at: string
          eic_contact: string | null
          eic_email: string | null
          engg_taskforce: string | null
          id: string
          lot: string
          name: string
          ntpc_eic: string | null
          pm_coordinator: string | null
          poi: string | null
          project_start_date: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          agency?: string | null
          agency_contacts?: Json | null
          capacity_mw?: number | null
          capacity_mwh: number
          created_at?: string
          eic_contact?: string | null
          eic_email?: string | null
          engg_taskforce?: string | null
          id?: string
          lot: string
          name: string
          ntpc_eic?: string | null
          pm_coordinator?: string | null
          poi?: string | null
          project_start_date?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          agency?: string | null
          agency_contacts?: Json | null
          capacity_mw?: number | null
          capacity_mwh?: number
          created_at?: string
          eic_contact?: string | null
          eic_email?: string | null
          engg_taskforce?: string | null
          id?: string
          lot?: string
          name?: string
          ntpc_eic?: string | null
          pm_coordinator?: string | null
          poi?: string | null
          project_start_date?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_authenticated_user: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "editor" | "viewer"
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
      app_role: ["admin", "editor", "viewer"],
    },
  },
} as const
