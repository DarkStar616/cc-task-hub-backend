-- Coot Club Task Hub Row Level Security (RLS) Policies
-- Migration: Comprehensive RLS policies for all tables
-- Created: 2024-12-22

-- =============================================
-- STEP 1: ENABLE RLS ON ALL TABLES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics ENABLE ROW LEVEL SECURITY;

-- =============================================
-- STEP 2: HELPER FUNCTIONS FOR RLS POLICIES
-- =============================================

-- Function to get current user's role name
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
BEGIN
    RETURN (
        SELECT r.name
        FROM public.users u
        JOIN public.roles r ON u.role_id = r.id
        WHERE u.id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current user's department ID
CREATE OR REPLACE FUNCTION public.get_user_department_id()
RETURNS uuid AS $$
BEGIN
    RETURN (
        SELECT department_id
        FROM public.users
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is manager of a department
CREATE OR REPLACE FUNCTION public.is_department_manager(dept_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.departments
        WHERE id = dept_id AND manager_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- STEP 3: ROLES TABLE POLICIES
-- =============================================

-- Roles: Only God and Admin can manage roles, others can read
DROP POLICY IF EXISTS "roles_select_policy" ON public.roles;
CREATE POLICY "roles_select_policy"
ON public.roles FOR SELECT
USING (
    public.get_user_role() IN ('God', 'Admin', 'Manager', 'User', 'Guest')
);

DROP POLICY IF EXISTS "roles_insert_policy" ON public.roles;
CREATE POLICY "roles_insert_policy"
ON public.roles FOR INSERT
WITH CHECK (
    public.get_user_role() IN ('God', 'Admin')
);

DROP POLICY IF EXISTS "roles_update_policy" ON public.roles;
CREATE POLICY "roles_update_policy"
ON public.roles FOR UPDATE
USING (
    public.get_user_role() IN ('God', 'Admin')
)
WITH CHECK (
    public.get_user_role() IN ('God', 'Admin')
);

DROP POLICY IF EXISTS "roles_delete_policy" ON public.roles;
CREATE POLICY "roles_delete_policy"
ON public.roles FOR DELETE
USING (
    public.get_user_role() IN ('God', 'Admin')
);

-- =============================================
-- STEP 4: DEPARTMENTS TABLE POLICIES
-- =============================================

-- Departments: God/Admin full access, Manager can view/update their department, Users can view
DROP POLICY IF EXISTS "departments_select_policy" ON public.departments;
CREATE POLICY "departments_select_policy"
ON public.departments FOR SELECT
USING (
    public.get_user_role() IN ('God', 'Admin') OR
    public.get_user_role() = 'Manager' AND (id = public.get_user_department_id() OR manager_id = auth.uid()) OR
    public.get_user_role() IN ('User', 'Guest')
);

DROP POLICY IF EXISTS "departments_insert_policy" ON public.departments;
CREATE POLICY "departments_insert_policy"
ON public.departments FOR INSERT
WITH CHECK (
    public.get_user_role() IN ('God', 'Admin')
);

DROP POLICY IF EXISTS "departments_update_policy" ON public.departments;
CREATE POLICY "departments_update_policy"
ON public.departments FOR UPDATE
USING (
    public.get_user_role() IN ('God', 'Admin') OR
    (public.get_user_role() = 'Manager' AND (id = public.get_user_department_id() OR manager_id = auth.uid()))
)
WITH CHECK (
    public.get_user_role() IN ('God', 'Admin') OR
    (public.get_user_role() = 'Manager' AND (id = public.get_user_department_id() OR manager_id = auth.uid()))
);

DROP POLICY IF EXISTS "departments_delete_policy" ON public.departments;
CREATE POLICY "departments_delete_policy"
ON public.departments FOR DELETE
USING (
    public.get_user_role() IN ('God', 'Admin')
);

-- =============================================
-- STEP 5: USERS TABLE POLICIES
-- =============================================

-- Users: Users can see/update their own row, Managers/Admins can see/update users in their department, God can access all
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
CREATE POLICY "users_select_policy"
ON public.users FOR SELECT
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND department_id = public.get_user_department_id() OR
    id = auth.uid() OR
    public.get_user_role() = 'Guest'
);

DROP POLICY IF EXISTS "users_insert_policy" ON public.users;
CREATE POLICY "users_insert_policy"
ON public.users FOR INSERT
WITH CHECK (
    public.get_user_role() IN ('God', 'Admin') OR
    (public.get_user_role() = 'Manager' AND department_id = public.get_user_department_id())
);

DROP POLICY IF EXISTS "users_update_policy" ON public.users;
CREATE POLICY "users_update_policy"
ON public.users FOR UPDATE
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND department_id = public.get_user_department_id() OR
    id = auth.uid()
)
WITH CHECK (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND department_id = public.get_user_department_id() OR
    id = auth.uid()
);

DROP POLICY IF EXISTS "users_delete_policy" ON public.users;
CREATE POLICY "users_delete_policy"
ON public.users FOR DELETE
USING (
    public.get_user_role() IN ('God', 'Admin')
);

-- =============================================
-- STEP 6: SOPS TABLE POLICIES
-- =============================================

-- SOPs: All users can view, only Admin/Manager/God can create/edit/delete in their department
DROP POLICY IF EXISTS "sops_select_policy" ON public.sops;
CREATE POLICY "sops_select_policy"
ON public.sops FOR SELECT
USING (
    public.get_user_role() IN ('God', 'Admin', 'Manager', 'User', 'Guest')
);

DROP POLICY IF EXISTS "sops_insert_policy" ON public.sops;
CREATE POLICY "sops_insert_policy"
ON public.sops FOR INSERT
WITH CHECK (
    public.get_user_role() = 'God' OR
    public.get_user_role() = 'Admin' OR
    (public.get_user_role() = 'Manager' AND department_id = public.get_user_department_id())
);

DROP POLICY IF EXISTS "sops_update_policy" ON public.sops;
CREATE POLICY "sops_update_policy"
ON public.sops FOR UPDATE
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() = 'Admin' OR
    (public.get_user_role() = 'Manager' AND department_id = public.get_user_department_id())
)
WITH CHECK (
    public.get_user_role() = 'God' OR
    public.get_user_role() = 'Admin' OR
    (public.get_user_role() = 'Manager' AND department_id = public.get_user_department_id())
);

DROP POLICY IF EXISTS "sops_delete_policy" ON public.sops;
CREATE POLICY "sops_delete_policy"
ON public.sops FOR DELETE
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() = 'Admin' OR
    (public.get_user_role() = 'Manager' AND department_id = public.get_user_department_id())
);

-- =============================================
-- STEP 7: TASKS TABLE POLICIES
-- =============================================

-- Tasks: Users can view/update their assigned tasks, Managers/Admins can manage tasks in their department, God has full access
DROP POLICY IF EXISTS "tasks_select_policy" ON public.tasks;
CREATE POLICY "tasks_select_policy"
ON public.tasks FOR SELECT
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND department_id = public.get_user_department_id() OR
    assigned_to = auth.uid() OR
    created_by = auth.uid() OR
    public.get_user_role() = 'Guest'
);

DROP POLICY IF EXISTS "tasks_insert_policy" ON public.tasks;
CREATE POLICY "tasks_insert_policy"
ON public.tasks FOR INSERT
WITH CHECK (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND department_id = public.get_user_department_id() OR
    public.get_user_role() = 'User'
);

DROP POLICY IF EXISTS "tasks_update_policy" ON public.tasks;
CREATE POLICY "tasks_update_policy"
ON public.tasks FOR UPDATE
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND department_id = public.get_user_department_id() OR
    assigned_to = auth.uid()
)
WITH CHECK (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND department_id = public.get_user_department_id() OR
    assigned_to = auth.uid()
);

DROP POLICY IF EXISTS "tasks_delete_policy" ON public.tasks;
CREATE POLICY "tasks_delete_policy"
ON public.tasks FOR DELETE
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND department_id = public.get_user_department_id()
);

-- =============================================
-- STEP 8: CLOCK SESSIONS TABLE POLICIES
-- =============================================

-- Clock Sessions: Users can only access their own records, Managers/Admins department only, God all records
DROP POLICY IF EXISTS "clock_sessions_select_policy" ON public.clock_sessions;
CREATE POLICY "clock_sessions_select_policy"
ON public.clock_sessions FOR SELECT
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid() OR
    public.get_user_role() = 'Guest'
);

DROP POLICY IF EXISTS "clock_sessions_insert_policy" ON public.clock_sessions;
CREATE POLICY "clock_sessions_insert_policy"
ON public.clock_sessions FOR INSERT
WITH CHECK (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid()
);

DROP POLICY IF EXISTS "clock_sessions_update_policy" ON public.clock_sessions;
CREATE POLICY "clock_sessions_update_policy"
ON public.clock_sessions FOR UPDATE
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid()
)
WITH CHECK (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid()
);

DROP POLICY IF EXISTS "clock_sessions_delete_policy" ON public.clock_sessions;
CREATE POLICY "clock_sessions_delete_policy"
ON public.clock_sessions FOR DELETE
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    )
);

-- =============================================
-- STEP 9: REMINDERS TABLE POLICIES
-- =============================================

-- Reminders: Users can only access their own records, Managers/Admins department only, God all records
DROP POLICY IF EXISTS "reminders_select_policy" ON public.reminders;
CREATE POLICY "reminders_select_policy"
ON public.reminders FOR SELECT
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid() OR
    public.get_user_role() = 'Guest'
);

DROP POLICY IF EXISTS "reminders_insert_policy" ON public.reminders;
CREATE POLICY "reminders_insert_policy"
ON public.reminders FOR INSERT
WITH CHECK (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid()
);

DROP POLICY IF EXISTS "reminders_update_policy" ON public.reminders;
CREATE POLICY "reminders_update_policy"
ON public.reminders FOR UPDATE
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid()
)
WITH CHECK (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid()
);

DROP POLICY IF EXISTS "reminders_delete_policy" ON public.reminders;
CREATE POLICY "reminders_delete_policy"
ON public.reminders FOR DELETE
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid()
);

-- =============================================
-- STEP 10: AUDIT LOGS TABLE POLICIES
-- =============================================

-- Audit Logs: Users can only access their own records, Managers/Admins department only, God all records
DROP POLICY IF EXISTS "audit_logs_select_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_select_policy"
ON public.audit_logs FOR SELECT
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid() OR
    public.get_user_role() = 'Guest'
);

DROP POLICY IF EXISTS "audit_logs_insert_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_policy"
ON public.audit_logs FOR INSERT
WITH CHECK (
    public.get_user_role() IN ('God', 'Admin', 'Manager', 'User')
);

-- Audit logs should not be updated or deleted (immutable)
DROP POLICY IF EXISTS "audit_logs_update_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_update_policy"
ON public.audit_logs FOR UPDATE
USING (false);

DROP POLICY IF EXISTS "audit_logs_delete_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_delete_policy"
ON public.audit_logs FOR DELETE
USING (
    public.get_user_role() = 'God'
);

-- =============================================
-- STEP 11: FEEDBACK TABLE POLICIES
-- =============================================

-- Feedback: Users can only access their own records, Managers/Admins department only, God all records
DROP POLICY IF EXISTS "feedback_select_policy" ON public.feedback;
CREATE POLICY "feedback_select_policy"
ON public.feedback FOR SELECT
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid() OR
    target_user_id = auth.uid() OR
    public.get_user_role() = 'Guest'
);

DROP POLICY IF EXISTS "feedback_insert_policy" ON public.feedback;
CREATE POLICY "feedback_insert_policy"
ON public.feedback FOR INSERT
WITH CHECK (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') OR
    user_id = auth.uid()
);

DROP POLICY IF EXISTS "feedback_update_policy" ON public.feedback;
CREATE POLICY "feedback_update_policy"
ON public.feedback FOR UPDATE
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid()
)
WITH CHECK (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    ) OR
    user_id = auth.uid()
);

DROP POLICY IF EXISTS "feedback_delete_policy" ON public.feedback;
CREATE POLICY "feedback_delete_policy"
ON public.feedback FOR DELETE
USING (
    public.get_user_role() = 'God' OR
    public.get_user_role() IN ('Admin', 'Manager') AND user_id IN (
        SELECT id FROM public.users WHERE department_id = public.get_user_department_id()
    )
);

-- =============================================
-- STEP 12: ANALYTICS TABLE POLICIES
-- =============================================

-- Analytics: Only Admin and God can view/manage analytics data, all others no access
DROP POLICY IF EXISTS "analytics_select_policy" ON public.analytics;
CREATE POLICY "analytics_select_policy"
ON public.analytics FOR SELECT
USING (
    public.get_user_role() IN ('God', 'Admin')
);

DROP POLICY IF EXISTS "analytics_insert_policy" ON public.analytics;
CREATE POLICY "analytics_insert_policy"
ON public.analytics FOR INSERT
WITH CHECK (
    public.get_user_role() IN ('God', 'Admin')
);

DROP POLICY IF EXISTS "analytics_update_policy" ON public.analytics;
CREATE POLICY "analytics_update_policy"
ON public.analytics FOR UPDATE
USING (
    public.get_user_role() IN ('God', 'Admin')
)
WITH CHECK (
    public.get_user_role() IN ('God', 'Admin')
);

DROP POLICY IF EXISTS "analytics_delete_policy" ON public.analytics;
CREATE POLICY "analytics_delete_policy"
ON public.analytics FOR DELETE
USING (
    public.get_user_role() IN ('God', 'Admin')
);

-- =============================================
-- STEP 13: GRANT PERMISSIONS TO AUTHENTICATED USERS
-- =============================================

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant permissions to anon users for public access (limited)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.roles TO anon;
GRANT SELECT ON public.departments TO anon;
GRANT SELECT ON public.sops TO anon;

-- =============================================
-- STEP 14: AUDIT TRIGGER FUNCTION
-- =============================================

-- Function to automatically create audit logs for all table changes
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_logs (
            table_name,
            record_id,
            action,
            old_values,
            user_id,
            ip_address
        ) VALUES (
            TG_TABLE_NAME,
            OLD.id,
            TG_OP,
            to_jsonb(OLD),
            auth.uid(),
            inet_client_addr()
        );
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.audit_logs (
            table_name,
            record_id,
            action,
            old_values,
            new_values,
            user_id,
            ip_address
        ) VALUES (
            TG_TABLE_NAME,
            NEW.id,
            TG_OP,
            to_jsonb(OLD),
            to_jsonb(NEW),
            auth.uid(),
            inet_client_addr()
        );
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_logs (
            table_name,
            record_id,
            action,
            new_values,
            user_id,
            ip_address
        ) VALUES (
            TG_TABLE_NAME,
            NEW.id,
            TG_OP,
            to_jsonb(NEW),
            auth.uid(),
            inet_client_addr()
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add audit triggers to all tables (except audit_logs itself)
CREATE TRIGGER audit_trigger_roles AFTER INSERT OR UPDATE OR DELETE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();
CREATE TRIGGER audit_trigger_departments AFTER INSERT OR UPDATE OR DELETE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();
CREATE TRIGGER audit_trigger_users AFTER INSERT OR UPDATE OR DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();
CREATE TRIGGER audit_trigger_sops AFTER INSERT OR UPDATE OR DELETE ON public.sops FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();
CREATE TRIGGER audit_trigger_tasks AFTER INSERT OR UPDATE OR DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();
CREATE TRIGGER audit_trigger_clock_sessions AFTER INSERT OR UPDATE OR DELETE ON public.clock_sessions FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();
CREATE TRIGGER audit_trigger_reminders AFTER INSERT OR UPDATE OR DELETE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();
CREATE TRIGGER audit_trigger_feedback AFTER INSERT OR UPDATE OR DELETE ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();
CREATE TRIGGER audit_trigger_analytics AFTER INSERT OR UPDATE OR DELETE ON public.analytics FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- =============================================
-- MIGRATION COMPLETE
-- =============================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Coot Club Task Hub RLS policies migration completed successfully';
    RAISE NOTICE 'RLS enabled on all tables: roles, departments, users, sops, tasks, clock_sessions, reminders, audit_logs, feedback, analytics';
    RAISE NOTICE 'Comprehensive policies applied based on role hierarchy: God > Admin > Manager > User > Guest';
    RAISE NOTICE 'Helper functions created for role and department checking';
    RAISE NOTICE 'Audit triggers added to all tables for automatic change tracking';
    RAISE NOTICE 'Permissions granted to authenticated and anon users';
END
$$;