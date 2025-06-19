export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          role_id: string | null;
          department_id: string | null;
          phone: string | null;
          status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email?: string | null;
          role_id?: string | null;
          department_id?: string | null;
          phone?: string | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          role_id?: string | null;
          department_id?: string | null;
          phone?: string | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      tasks: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          status: string | null;
          priority: string | null;
          assigned_to: string | null;
          created_by: string | null;
          department_id: string | null;
          due_date: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          status?: string | null;
          priority?: string | null;
          assigned_to?: string | null;
          created_by?: string | null;
          department_id?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          status?: string | null;
          priority?: string | null;
          assigned_to?: string | null;
          created_by?: string | null;
          department_id?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      reminders: {
        Row: {
          id: string;
          title: string;
          message: string | null;
          user_id: string;
          task_id: string | null;
          reminder_type: string | null;
          scheduled_for: string;
          status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          message?: string | null;
          user_id: string;
          task_id?: string | null;
          reminder_type?: string | null;
          scheduled_for: string;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          message?: string | null;
          user_id?: string;
          task_id?: string | null;
          reminder_type?: string | null;
          scheduled_for?: string;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      analytics: {
        Row: {
          id: string;
          metric_name: string;
          metric_type: string;
          user_id: string | null;
          task_id: string | null;
          department_id: string | null;
          metric_value: number;
          metric_unit: string | null;
          period_start: string | null;
          period_end: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          metric_name: string;
          metric_type: string;
          user_id?: string | null;
          task_id?: string | null;
          department_id?: string | null;
          metric_value: number;
          metric_unit?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          metric_name?: string;
          metric_type?: string;
          user_id?: string | null;
          task_id?: string | null;
          department_id?: string | null;
          metric_value?: number;
          metric_unit?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          table_name: string;
          record_id: string;
          action: string;
          old_values: Json | null;
          new_values: Json | null;
          user_id: string | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          table_name: string;
          record_id: string;
          action: string;
          old_values?: Json | null;
          new_values?: Json | null;
          user_id?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          table_name?: string;
          record_id?: string;
          action?: string;
          old_values?: Json | null;
          new_values?: Json | null;
          user_id?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
      roles: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          permissions: Json | null;
          created_at: string;
          updated_at: string;
        };
      };
      departments: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          manager_id: string | null;
          created_at: string;
          updated_at: string;
        };
      };
    };
  };
}
