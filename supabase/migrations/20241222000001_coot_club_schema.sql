-- Coot Club Task Hub Database Schema
-- Migration: Core database schema with dependency-ordered table creation
-- Created: 2024-12-22

-- =============================================
-- STEP 1: FOUNDATIONAL TABLES (NO DEPENDENCIES)
-- =============================================

-- Roles table - foundational table for RBAC
CREATE TABLE IF NOT EXISTS public.roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    description text,
    permissions jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Departments table - foundational table for organizational structure
CREATE TABLE IF NOT EXISTS public.departments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    description text,
    manager_id uuid, -- Will be linked after users table is created
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- =============================================
-- STEP 2: USERS TABLE (DEPENDS ON ROLES & DEPARTMENTS)
-- =============================================

-- Drop existing users table constraints if they exist to rebuild properly
ALTER TABLE IF EXISTS public.users DROP CONSTRAINT IF EXISTS users_role_id_fkey;
ALTER TABLE IF EXISTS public.users DROP CONSTRAINT IF EXISTS users_department_id_fkey;

-- Add new columns to existing users table for Coot Club requirements
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
ADD COLUMN IF NOT EXISTS hire_date date,
ADD COLUMN IF NOT EXISTS emergency_contact jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}';

-- Now add the manager foreign key to departments table
ALTER TABLE public.departments 
ADD CONSTRAINT departments_manager_id_fkey 
FOREIGN KEY (manager_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- =============================================
-- STEP 3: SOPs TABLE (DEPENDS ON USERS & DEPARTMENTS)
-- =============================================

-- Standard Operating Procedures table
CREATE TABLE IF NOT EXISTS public.sops (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    content text NOT NULL,
    version integer DEFAULT 1,
    status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    tags text[] DEFAULT '{}',
    attachments jsonb DEFAULT '[]',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- =============================================
-- STEP 4: TASKS TABLE (DEPENDS ON USERS, SOPS, DEPARTMENTS)
-- =============================================

-- Tasks table for task management
CREATE TABLE IF NOT EXISTS public.tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
    sop_id uuid REFERENCES public.sops(id) ON DELETE SET NULL,
    due_date timestamp with time zone,
    estimated_duration interval,
    actual_duration interval,
    completion_notes text,
    attachments jsonb DEFAULT '[]',
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    completed_at timestamp with time zone
);

-- =============================================
-- STEP 5: CLOCK SESSIONS TABLE (DEPENDS ON USERS & TASKS)
-- =============================================

-- Clock sessions for time tracking
CREATE TABLE IF NOT EXISTS public.clock_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
    clock_in timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    clock_out timestamp with time zone,
    break_duration interval DEFAULT '0 minutes',
    total_duration interval GENERATED ALWAYS AS (
        CASE 
            WHEN clock_out IS NOT NULL 
            THEN clock_out - clock_in - COALESCE(break_duration, '0 minutes'::interval)
            ELSE NULL 
        END
    ) STORED,
    location text,
    notes text,
    status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- =============================================
-- STEP 6: SUPPORTING TABLES (DEPEND ON USERS & TASKS)
-- =============================================

-- Reminders table
CREATE TABLE IF NOT EXISTS public.reminders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    message text,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
    reminder_type text DEFAULT 'task' CHECK (reminder_type IN ('task', 'meeting', 'deadline', 'general')),
    scheduled_for timestamp with time zone NOT NULL,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dismissed')),
    repeat_pattern text, -- 'daily', 'weekly', 'monthly', etc.
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Audit logs table for tracking all system changes
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values jsonb,
    new_values jsonb,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Feedback table for task and system feedback
CREATE TABLE IF NOT EXISTS public.feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text DEFAULT 'task' CHECK (type IN ('task', 'system', 'user', 'department')),
    subject text NOT NULL,
    content text NOT NULL,
    rating integer CHECK (rating >= 1 AND rating <= 5),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
    target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    status text DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'closed')),
    priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    attachments jsonb DEFAULT '[]',
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Analytics table for storing computed metrics and KPIs
CREATE TABLE IF NOT EXISTS public.analytics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name text NOT NULL,
    metric_type text NOT NULL CHECK (metric_type IN ('user', 'task', 'department', 'system')),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
    department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
    metric_value numeric NOT NULL,
    metric_unit text,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- =============================================
-- STEP 7: INDEXES FOR PERFORMANCE
-- =============================================

-- Roles indexes
CREATE INDEX IF NOT EXISTS idx_roles_name ON public.roles(name);

-- Departments indexes
CREATE INDEX IF NOT EXISTS idx_departments_name ON public.departments(name);
CREATE INDEX IF NOT EXISTS idx_departments_manager_id ON public.departments(manager_id);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_role_id ON public.users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON public.users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);

-- SOPs indexes
CREATE INDEX IF NOT EXISTS idx_sops_department_id ON public.sops(department_id);
CREATE INDEX IF NOT EXISTS idx_sops_created_by ON public.sops(created_by);
CREATE INDEX IF NOT EXISTS idx_sops_status ON public.sops(status);
CREATE INDEX IF NOT EXISTS idx_sops_tags ON public.sops USING GIN(tags);

-- Tasks indexes
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_department_id ON public.tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sop_id ON public.tasks(sop_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks(created_at);

-- Clock sessions indexes
CREATE INDEX IF NOT EXISTS idx_clock_sessions_user_id ON public.clock_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_clock_sessions_task_id ON public.clock_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_clock_sessions_clock_in ON public.clock_sessions(clock_in);
CREATE INDEX IF NOT EXISTS idx_clock_sessions_status ON public.clock_sessions(status);

-- Reminders indexes
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON public.reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON public.reminders(task_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_for ON public.reminders(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON public.reminders(status);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON public.audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- Feedback indexes
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_task_id ON public.feedback(task_id);
CREATE INDEX IF NOT EXISTS idx_feedback_target_user_id ON public.feedback(target_user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON public.feedback(type);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_analytics_metric_name ON public.analytics(metric_name);
CREATE INDEX IF NOT EXISTS idx_analytics_metric_type ON public.analytics(metric_type);
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON public.analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_task_id ON public.analytics(task_id);
CREATE INDEX IF NOT EXISTS idx_analytics_department_id ON public.analytics(department_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON public.analytics(created_at);

-- =============================================
-- STEP 8: SEED DATA FOR ROLES
-- =============================================

-- Insert default roles (God, Admin, Manager, User, Guest)
INSERT INTO public.roles (name, description, permissions) VALUES 
('God', 'Super administrator with all permissions', '{"all": true}'),
('Admin', 'System administrator with full access', '{"users": ["create", "read", "update", "delete"], "departments": ["create", "read", "update", "delete"], "sops": ["create", "read", "update", "delete"], "tasks": ["create", "read", "update", "delete"], "analytics": ["read"]}'),
('Manager', 'Department manager with team oversight', '{"users": ["read", "update"], "departments": ["read", "update"], "sops": ["create", "read", "update"], "tasks": ["create", "read", "update", "delete"], "analytics": ["read"]}'),
('User', 'Regular user with basic permissions', '{"sops": ["read"], "tasks": ["read", "update"], "feedback": ["create", "read"]}'),
('Guest', 'Limited access guest user', '{"sops": ["read"], "tasks": ["read"]}')
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- STEP 9: ENABLE REALTIME FOR KEY TABLES
-- =============================================

-- Enable realtime for key tables that need live updates
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.clock_sessions;
alter publication supabase_realtime add table public.reminders;
alter publication supabase_realtime add table public.feedback;

-- =============================================
-- STEP 10: UTILITY FUNCTIONS
-- =============================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers to all relevant tables
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sops_updated_at BEFORE UPDATE ON public.sops FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clock_sessions_updated_at BEFORE UPDATE ON public.clock_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reminders_updated_at BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_feedback_updated_at BEFORE UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to automatically set completed_at when task status changes to completed
CREATE OR REPLACE FUNCTION public.set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at = timezone('utc'::text, now());
    ELSIF NEW.status != 'completed' THEN
        NEW.completed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for task completion
CREATE TRIGGER set_task_completed_at_trigger 
BEFORE UPDATE ON public.tasks 
FOR EACH ROW EXECUTE FUNCTION public.set_task_completed_at();

-- =============================================
-- MIGRATION COMPLETE
-- =============================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Coot Club Task Hub database schema migration completed successfully';
    RAISE NOTICE 'Tables created: roles, departments, users (enhanced), sops, tasks, clock_sessions, reminders, audit_logs, feedback, analytics';
    RAISE NOTICE 'Roles seeded: God, Admin, Manager, User, Guest';
    RAISE NOTICE 'Indexes and triggers created for optimal performance';
    RAISE NOTICE 'Realtime enabled for: tasks, clock_sessions, reminders, feedback';
END
$$;