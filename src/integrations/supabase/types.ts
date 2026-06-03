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
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          field: string | null
          id: string
          new_value: string | null
          old_value: string | null
          station_id: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          field?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          station_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          field?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          station_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      boi_documents: {
        Row: {
          boi_id: string
          category: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          station_id: string
          uploaded_by: string | null
        }
        Insert: {
          boi_id: string
          category?: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          station_id: string
          uploaded_by?: string | null
        }
        Update: {
          boi_id?: string
          category?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          station_id?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      boi_master: {
        Row: {
          drawings_count: number | null
          id: string
          inspection_category: string | null
          name: string
          scheduled_po_date: string | null
          sl_no: number
          sort_order: number
        }
        Insert: {
          drawings_count?: number | null
          id?: string
          inspection_category?: string | null
          name: string
          scheduled_po_date?: string | null
          sl_no: number
          sort_order?: number
        }
        Update: {
          drawings_count?: number | null
          id?: string
          inspection_category?: string | null
          name?: string
          scheduled_po_date?: string | null
          sl_no?: number
          sort_order?: number
        }
        Relationships: []
      }
      compliance_documents: {
        Row: {
          compliance_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          station_id: string
          uploaded_by: string | null
        }
        Insert: {
          compliance_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          station_id: string
          uploaded_by?: string | null
        }
        Update: {
          compliance_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          station_id?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      compliance_master: {
        Row: {
          authority: string | null
          category: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          authority?: string | null
          category: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          authority?: string | null
          category?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      delay_register: {
        Row: {
          corrective_action: string | null
          created_at: string
          id: string
          reason_category: string | null
          recovery_date: string | null
          recovery_plan: string | null
          responsibility: string | null
          root_cause: string | null
          station_id: string
          status: string
          task_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          corrective_action?: string | null
          created_at?: string
          id?: string
          reason_category?: string | null
          recovery_date?: string | null
          recovery_plan?: string | null
          responsibility?: string | null
          root_cause?: string | null
          station_id: string
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          corrective_action?: string | null
          created_at?: string
          id?: string
          reason_category?: string | null
          recovery_date?: string | null
          recovery_plan?: string | null
          responsibility?: string | null
          root_cause?: string | null
          station_id?: string
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
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
          station_id: string
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
          station_id: string
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
          station_id?: string
          wbs_code?: string
        }
        Relationships: []
      }
      meeting_plans: {
        Row: {
          agenda: string | null
          created_at: string
          created_by: string | null
          id: string
          meeting_type: string
          planned_date: string
          planned_time: string | null
          station_id: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_type: string
          planned_date: string
          planned_time?: string | null
          station_id: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_type?: string
          planned_date?: string
          planned_time?: string | null
          station_id?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meeting_recordings: {
        Row: {
          created_at: string
          duration_seconds: number | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          meeting_id: string | null
          meeting_type: string | null
          mime_type: string | null
          station_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          meeting_id?: string | null
          meeting_type?: string | null
          mime_type?: string | null
          station_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          meeting_id?: string | null
          meeting_type?: string | null
          mime_type?: string | null
          station_id?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      meetings: {
        Row: {
          action_items: string | null
          agenda: string | null
          attendees: string | null
          created_at: string
          created_by: string | null
          id: string
          meeting_date: string
          meeting_type: string
          minutes: string | null
          next_meeting_date: string | null
          station_id: string
          updated_at: string
        }
        Insert: {
          action_items?: string | null
          agenda?: string | null
          attendees?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_date: string
          meeting_type: string
          minutes?: string | null
          next_meeting_date?: string | null
          station_id: string
          updated_at?: string
        }
        Update: {
          action_items?: string | null
          agenda?: string | null
          attendees?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_date?: string
          meeting_type?: string
          minutes?: string | null
          next_meeting_date?: string | null
          station_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_dismissals: {
        Row: {
          dismissed_at: string
          id: string
          notification_key: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          id?: string
          notification_key: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          id?: string
          notification_key?: string
          user_id?: string
        }
        Relationships: []
      }
      station_boi_status: {
        Row: {
          actual_po_date: string | null
          boi_id: string
          delivery_date: string | null
          drawings_status: string | null
          id: string
          inspection_status: string | null
          mobilization_status: string | null
          remarks: string | null
          site_receipt_date: string | null
          station_id: string
          sub_vendor_category: string | null
          sub_vendor_details: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_po_date?: string | null
          boi_id: string
          delivery_date?: string | null
          drawings_status?: string | null
          id?: string
          inspection_status?: string | null
          mobilization_status?: string | null
          remarks?: string | null
          site_receipt_date?: string | null
          station_id: string
          sub_vendor_category?: string | null
          sub_vendor_details?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_po_date?: string | null
          boi_id?: string
          delivery_date?: string | null
          drawings_status?: string | null
          id?: string
          inspection_status?: string | null
          mobilization_status?: string | null
          remarks?: string | null
          site_receipt_date?: string | null
          station_id?: string
          sub_vendor_category?: string | null
          sub_vendor_details?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      station_compliance: {
        Row: {
          application_date: string | null
          approval_date: string | null
          compliance_id: string
          document_ref: string | null
          expiry_date: string | null
          id: string
          owner: string | null
          remarks: string | null
          station_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          application_date?: string | null
          approval_date?: string | null
          compliance_id: string
          document_ref?: string | null
          expiry_date?: string | null
          id?: string
          owner?: string | null
          remarks?: string | null
          station_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          application_date?: string | null
          approval_date?: string | null
          compliance_id?: string
          document_ref?: string | null
          expiry_date?: string | null
          id?: string
          owner?: string | null
          remarks?: string | null
          station_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
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
          completion_date: string | null
          created_at: string
          eic_contact: string | null
          eic_email: string | null
          engg_taskforce: string | null
          id: string
          lot: string
          name: string
          noa_date: string | null
          ntpc_eic: string | null
          pm_coordinator: string | null
          poi: string | null
          project_cost_cr: number | null
          project_start_date: string | null
          sort_order: number | null
          transformer_qty: number | null
          transformer_rating: string | null
          updated_at: string
        }
        Insert: {
          agency?: string | null
          agency_contacts?: Json | null
          capacity_mw?: number | null
          capacity_mwh: number
          completion_date?: string | null
          created_at?: string
          eic_contact?: string | null
          eic_email?: string | null
          engg_taskforce?: string | null
          id?: string
          lot: string
          name: string
          noa_date?: string | null
          ntpc_eic?: string | null
          pm_coordinator?: string | null
          poi?: string | null
          project_cost_cr?: number | null
          project_start_date?: string | null
          sort_order?: number | null
          transformer_qty?: number | null
          transformer_rating?: string | null
          updated_at?: string
        }
        Update: {
          agency?: string | null
          agency_contacts?: Json | null
          capacity_mw?: number | null
          capacity_mwh?: number
          completion_date?: string | null
          created_at?: string
          eic_contact?: string | null
          eic_email?: string | null
          engg_taskforce?: string | null
          id?: string
          lot?: string
          name?: string
          noa_date?: string | null
          ntpc_eic?: string | null
          pm_coordinator?: string | null
          poi?: string | null
          project_cost_cr?: number | null
          project_start_date?: string | null
          sort_order?: number | null
          transformer_qty?: number | null
          transformer_rating?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          station_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          station_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          station_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weekly_review_plan: {
        Row: {
          agenda_notes: string | null
          created_at: string
          created_by: string | null
          day_of_week: number
          id: string
          slot: number
          station_id: string
          week_start_date: string
        }
        Insert: {
          agenda_notes?: string | null
          created_at?: string
          created_by?: string | null
          day_of_week: number
          id?: string
          slot: number
          station_id: string
          week_start_date: string
        }
        Update: {
          agenda_notes?: string | null
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          id?: string
          slot?: number
          station_id?: string
          week_start_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_station: {
        Args: { _station_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_authenticated_user: { Args: never; Returns: boolean }
      user_station_id: { Args: { _user_id: string }; Returns: string }
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
