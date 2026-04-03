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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          batch_id: string | null
          content: string
          created_at: string
          id: string
          institute_code: string
          notify_push: boolean
          posted_by: string
          posted_by_name: string | null
          title: string
          type: string | null
        }
        Insert: {
          batch_id?: string | null
          content: string
          created_at?: string
          id?: string
          institute_code: string
          notify_push?: boolean
          posted_by: string
          posted_by_name?: string | null
          title: string
          type?: string | null
        }
        Update: {
          batch_id?: string | null
          content?: string
          created_at?: string
          id?: string
          institute_code?: string
          notify_push?: boolean
          posted_by?: string
          posted_by_name?: string | null
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          batch_id: string
          created_at: string
          date: string
          id: string
          institute_code: string
          marked_by: string | null
          present: boolean
          student_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          date?: string
          id?: string
          institute_code: string
          marked_by?: string | null
          present?: boolean
          student_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          date?: string
          id?: string
          institute_code?: string
          marked_by?: string | null
          present?: boolean
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_applications: {
        Row: {
          applied_at: string
          batch_id: string
          id: string
          institute_code: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          student_id: string
        }
        Insert: {
          applied_at?: string
          batch_id: string
          id?: string
          institute_code: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_id: string
        }
        Update: {
          applied_at?: string
          batch_id?: string
          id?: string
          institute_code?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_applications_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_messages: {
        Row: {
          batch_id: string
          created_at: string
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          institute_code: string
          message: string
          reactions: Json
          reply_to_id: string | null
          sender_id: string
          sender_name: string
          sender_role: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          institute_code: string
          message: string
          reactions?: Json
          reply_to_id?: string | null
          sender_id: string
          sender_name: string
          sender_role?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          institute_code?: string
          message?: string
          reactions?: Json
          reply_to_id?: string | null
          sender_id?: string
          sender_name?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_messages_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "batch_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_teacher_requests: {
        Row: {
          batch_id: string
          batch_name: string | null
          course: string | null
          created_at: string
          id: string
          institute_code: string
          requested_by: string
          status: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          batch_name?: string | null
          course?: string | null
          created_at?: string
          id?: string
          institute_code: string
          requested_by: string
          status?: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          batch_name?: string | null
          course?: string | null
          created_at?: string
          id?: string
          institute_code?: string
          requested_by?: string
          status?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_teacher_requests_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          course: string
          created_at: string
          description: string | null
          enrollment_open: boolean
          id: string
          institute_code: string
          is_active: boolean
          name: string
          pending_teacher_name: string | null
          schedule: string | null
          teacher_id: string | null
          teacher_name: string | null
          updated_at: string
        }
        Insert: {
          course: string
          created_at?: string
          description?: string | null
          enrollment_open?: boolean
          id?: string
          institute_code: string
          is_active?: boolean
          name: string
          pending_teacher_name?: string | null
          schedule?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
        }
        Update: {
          course?: string
          created_at?: string
          description?: string | null
          enrollment_open?: boolean
          id?: string
          institute_code?: string
          is_active?: boolean
          name?: string
          pending_teacher_name?: string | null
          schedule?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fees: {
        Row: {
          amount: number
          annual_amount: number | null
          batch_id: string | null
          created_at: string
          cycle_day: number | null
          description: string | null
          due_date: string | null
          id: string
          institute_code: string
          paid: boolean
          paid_cycles_count: number
          paid_date: string | null
          payment_frequency: string | null
          start_month: string | null
          student_id: string
          total_paid_amount: number
          updated_at: string
        }
        Insert: {
          amount: number
          annual_amount?: number | null
          batch_id?: string | null
          created_at?: string
          cycle_day?: number | null
          description?: string | null
          due_date?: string | null
          id?: string
          institute_code: string
          paid?: boolean
          paid_cycles_count?: number
          paid_date?: string | null
          payment_frequency?: string | null
          start_month?: string | null
          student_id: string
          total_paid_amount?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          annual_amount?: number | null
          batch_id?: string | null
          created_at?: string
          cycle_day?: number | null
          description?: string | null
          due_date?: string | null
          id?: string
          institute_code?: string
          paid?: boolean
          paid_cycles_count?: number
          paid_date?: string | null
          payment_frequency?: string | null
          start_month?: string | null
          student_id?: string
          total_paid_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      homework_submissions: {
        Row: {
          batch_id: string
          homework_id: string
          id: string
          institute_code: string
          note: string | null
          student_id: string
          submitted_at: string
        }
        Insert: {
          batch_id: string
          homework_id: string
          id?: string
          institute_code: string
          note?: string | null
          student_id: string
          submitted_at?: string
        }
        Update: {
          batch_id?: string
          homework_id?: string
          id?: string
          institute_code?: string
          note?: string | null
          student_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_submissions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homeworks"
            referencedColumns: ["id"]
          },
        ]
      }
      homeworks: {
        Row: {
          batch_id: string
          created_at: string
          description: string | null
          due_date: string | null
          file_name: string | null
          file_url: string | null
          id: string
          institute_code: string
          link_url: string | null
          teacher_id: string
          teacher_name: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          institute_code: string
          link_url?: string | null
          teacher_id: string
          teacher_name?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          institute_code?: string
          link_url?: string | null
          teacher_id?: string
          teacher_name?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homeworks_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      institutes: {
        Row: {
          attendance_marked_by: string
          city: string | null
          created_at: string
          email: string
          govt_registration_no: string
          id: string
          institute_code: string
          institute_name: string
          owner_name: string
          owner_user_id: string | null
          phone: string
          status: Database["public"]["Enums"]["institute_status"]
          student_enrollment_enabled: boolean
          teacher_enrollment_enabled: boolean
          updated_at: string
        }
        Insert: {
          attendance_marked_by?: string
          city?: string | null
          created_at?: string
          email: string
          govt_registration_no: string
          id?: string
          institute_code: string
          institute_name: string
          owner_name: string
          owner_user_id?: string | null
          phone: string
          status?: Database["public"]["Enums"]["institute_status"]
          student_enrollment_enabled?: boolean
          teacher_enrollment_enabled?: boolean
          updated_at?: string
        }
        Update: {
          attendance_marked_by?: string
          city?: string | null
          created_at?: string
          email?: string
          govt_registration_no?: string
          id?: string
          institute_code?: string
          institute_name?: string
          owner_name?: string
          owner_user_id?: string | null
          phone?: string
          status?: Database["public"]["Enums"]["institute_status"]
          student_enrollment_enabled?: boolean
          teacher_enrollment_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      pending_requests: {
        Row: {
          created_at: string
          email: string
          extra_data: Json | null
          full_name: string
          id: string
          institute_code: string
          review_note: string | null
          reviewed_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          extra_data?: Json | null
          full_name: string
          id?: string
          institute_code: string
          review_note?: string | null
          reviewed_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          extra_data?: Json | null
          full_name?: string
          id?: string
          institute_code?: string
          review_note?: string | null
          reviewed_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          institute_code: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          role_based_code: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          institute_code?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["app_role"]
          role_based_code?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          institute_code?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          role_based_code?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          institute_code: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          institute_code: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          institute_code?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          created_at: string
          id: string
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          identifier: string
          request_count?: number
          window_start?: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      students_batches: {
        Row: {
          batch_id: string
          enrolled_at: string
          id: string
          institute_code: string
          student_id: string
        }
        Insert: {
          batch_id: string
          enrolled_at?: string
          id?: string
          institute_code: string
          student_id: string
        }
        Update: {
          batch_id?: string
          enrolled_at?: string
          id?: string
          institute_code?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_batches_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_applications: {
        Row: {
          city: string
          created_at: string
          email: string
          facial_image_url: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string
          position: string
          status: string
          updated_at: string
        }
        Insert: {
          city: string
          created_at?: string
          email: string
          facial_image_url?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone: string
          position: string
          status?: string
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          email?: string
          facial_image_url?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string
          position?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      test_scores: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          institute_code: string
          max_marks: number
          score: number
          student_id: string
          test_date: string
          test_name: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          institute_code: string
          max_marks?: number
          score?: number
          student_id: string
          test_date?: string
          test_name: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          institute_code?: string
          max_marks?: number
          score?: number
          student_id?: string
          test_date?: string
          test_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_scores_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          city: string | null
          id: string
          institute_code: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          city?: string | null
          id?: string
          institute_code?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          city?: string | null
          id?: string
          institute_code?: string | null
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
      check_batch_enrollment_open: {
        Args: { _batch_id: string }
        Returns: boolean
      }
      check_institute_enrollment: {
        Args: { _institute_code: string; _role: string }
        Returns: boolean
      }
      get_my_child_user_id: { Args: never; Returns: string }
      get_my_institute_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "teacher"
        | "student"
        | "parent"
        | "app_owner"
      institute_status: "pending" | "approved" | "rejected"
      user_status: "pending" | "approved" | "rejected" | "active"
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
      app_role: [
        "super_admin",
        "admin",
        "teacher",
        "student",
        "parent",
        "app_owner",
      ],
      institute_status: ["pending", "approved", "rejected"],
      user_status: ["pending", "approved", "rejected", "active"],
    },
  },
} as const
