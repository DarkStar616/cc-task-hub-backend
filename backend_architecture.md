# Backend Architectural Overview

This document provides a comprehensive overview of the backend architecture for the Coot Club Task Hub application. It is intended to facilitate compatibility comparison with the frontend and guide integration efforts.

## 1. High-Level Architecture and Technology Stack

The backend follows a modern, serverless architecture pattern, leveraging the capabilities of Supabase and its integrated services.

*   **Overall Architecture:** The system is built as a **REST API** with a **Supabase/PostgreSQL backend**. Business logic is implemented through a combination of Next.js API routes and serverless Deno-based Edge Functions.
*   **Main Frameworks, Libraries, and Tools:**
    *   **Database:** **PostgreSQL**, managed by Supabase.
    *   **Authentication:** **Supabase Auth**, which handles user authentication and management.
    *   **API Framework:** **Next.js API Routes** for standard RESTful endpoints.
    *   **Serverless Functions:** **Deno** for more complex, event-driven, or scheduled business logic (Supabase Edge Functions).
*   **Primary Folders and Their Purposes:**
    *   `supabase/migrations`: Contains the SQL files that define the database schema, including tables, relationships, indexes, and row-level security (RLS) policies.
    *   `src/app/api/v1`: Contains the Next.js API route handlers, which define the primary REST API endpoints.
    *   `supabase/functions`: Contains the Deno-based serverless functions for complex business logic, scheduled tasks, and integrations with external services.
    *   `src/utils`: Contains shared utility functions for authentication, validation, and other common tasks.

## 2. Database Schema and Data Models

The database schema is well-structured and relational, with a clear separation of concerns.

*   **Key Database Tables:**
    *   `users`: Stores user information, including authentication details, roles, and department assignments.
    *   `roles`: Defines the different user roles in the system (e.g., `God`, `Admin`, `Manager`, `User`, `Guest`).
    *   `departments`: Defines the organizational structure of the company.
    *   `sops`: Stores Standard Operating Procedures.
    *   `tasks`: The central table for task management, with relationships to users, departments, and SOPs.
    *   `clock_sessions`: Tracks time spent on tasks.
    *   `reminders`: Stores reminders for tasks and other events.
    *   `audit_logs`: Records all changes to the database for auditing purposes.
    *   `feedback`: Allows users to provide feedback on tasks, the system, or other users.
    *   `analytics`: Stores aggregated analytics data.
*   **Important Fields and Data Types:**
    *   **`users`**: `id` (uuid), `email` (text), `role_id` (uuid), `department_id` (uuid), `status` (text).
    *   **`tasks`**: `id` (uuid), `title` (text), `status` (text), `priority` (text), `assigned_to` (uuid), `created_by` (uuid), `department_id` (uuid), `due_date` (timestamp with time zone).
    *   **`clock_sessions`**: `id` (uuid), `user_id` (uuid), `task_id` (uuid), `clock_in` (timestamp with time zone), `clock_out` (timestamp with time zone), `total_duration` (interval).
*   **Indexes, Triggers, and Special Columns:**
    *   **Indexes:** Numerous indexes are defined on foreign key columns and frequently queried fields to ensure optimal performance.
    *   **Triggers:**
        *   `update_updated_at_column`: Automatically updates the `updated_at` timestamp on all relevant tables whenever a row is updated.
        *   `set_task_completed_at`: Automatically sets the `completed_at` timestamp when a task's status is changed to `completed`.
        *   `audit_trigger_function`: Automatically creates an entry in the `audit_logs` table for any `INSERT`, `UPDATE`, or `DELETE` operation on most tables.
    *   **Generated Columns:** The `total_duration` column in the `clock_sessions` table is a generated column that automatically calculates the duration of a clock session.

## 3. API Endpoints and Business Logic

The backend exposes a RESTful API for frontend consumption and uses serverless functions for more complex operations.

*   **API Endpoints:** The API is versioned under `/api/v1` and follows a standard RESTful convention. Key endpoints include:
    *   `GET /api/v1/users`: List users (with filtering).
    *   `POST /api/v1/users`: Create a new user.
    *   `GET /api/v1/tasks`: List tasks (with filtering).
    *   `POST /api/v1/tasks`: Create a new task.
    *   `GET /api/v1/tasks/{id}`: Get a specific task.
    *   `PUT /api/v1/tasks/{id}`: Update a specific task.
    *   `DELETE /api/v1/tasks/{id}`: Delete a specific task (soft delete).
    *   (Other endpoints for `sops`, `reminders`, `feedback`, etc.)
*   **Complex Business Logic:** The `supabase/functions` directory contains several Edge Functions that handle complex business logic:
    *   `complex-business-logic`: A multi-purpose function that can handle operations like `bulk_task_assignment`, `cascade_task_completion`, and `user_workload_balancing`.
*   **Scheduled or Event-Driven Backend Jobs:**
    *   `daily-reminders`: A scheduled function that runs daily to send out reminders for pending and overdue tasks via email and WhatsApp.
    *   `scheduled-analytics`: A scheduled function that runs periodically to calculate and store various analytics metrics.

## 4. Authentication & Authorization

The backend has a robust authentication and authorization system based on Supabase Auth and RLS.

*   **Authentication Mechanism:** Authentication is handled by **Supabase Auth**, which uses **JWTs** to authenticate users. The frontend will need to interact with the Supabase client library to handle user sign-up, sign-in, and session management.
*   **Role-Based Access Controls (RBAC) and Row-Level Security (RLS):** The backend implements a comprehensive RBAC and RLS system.
    *   **Roles:** `God`, `Admin`, `Manager`, `User`, `Guest`.
    *   **RLS Policies:** The `rls_policies.sql` migration file defines a set of RLS policies that restrict access to data at the database level. For example, a `User` can only see tasks assigned to them, while a `Manager` can see all tasks within their department.
*   **User Identity and Permission Checks:** In the API routes, the `getAuthContext` utility function is used to get the authenticated user's context, and the `hasRole` function is used to check the user's role before performing actions.

## 5. Integration Points & External Services

The backend integrates with several external services for notifications and file storage.

*   **Third-Party Services:**
    *   **Email:** The `daily-reminders` function uses an email service to send notifications.
    *   **WhatsApp:** The `daily-reminders` function also integrates with WhatsApp for sending messages.
*   **File Uploads and Storage:** The `file-upload` API endpoint handles file uploads. Attachments are stored as JSONB in the database, which likely contains metadata about the files (e.g., a URL to the file in Supabase Storage).

## 6. Error Handling and Edge Cases

The backend has a standardized approach to error handling and input validation.

*   **Error Responses:** The API routes use utility functions like `createErrorResponse` and `createBadRequestResponse` to return standardized JSON error responses.
*   **Input Validation:** Input validation is performed using **Zod schemas**. The `validateRequestBody` function is used in the API route handlers to validate the request body against a Zod schema before processing it.

## 7. Known Limitations or Technical Debt

*   **Placeholder `actual_duration` Calculation:** In the `src/app/api/v1/tasks/[id]/route.ts` file, the calculation for `actual_duration` when a task is completed is currently a placeholder (`updateData.actual_duration = "00:00:00"; // Placeholder`). This will need to be implemented properly.

## 8. Summary and Compatibility Notes

*   **Summary:** The backend provides a well-structured and secure foundation for the application. The combination of a PostgreSQL database, a RESTful API, and serverless functions allows for a flexible and scalable architecture. The data model is centered around tasks, users, and departments, with clear relationships between them.
*   **Compatibility Notes for Frontend:**
    *   **Authentication:** The frontend will need to use the Supabase client library for authentication.
    *   **API Interaction:** The frontend will interact with the backend via the REST API. It should be prepared to handle standard HTTP status codes and JSON responses.
    *   **Authorization:** The frontend needs to be aware of the RLS policies. It should not try to display data or perform actions that the user is not authorized to do, as this will result in `403 Forbidden` or `404 Not Found` errors from the backend. The UI should be designed to reflect the user's permissions.
    *   **Realtime:** The `tasks`, `clock_sessions`, `reminders`, and `feedback` tables are enabled for realtime updates. The frontend can subscribe to changes on these tables to provide a more dynamic user experience.
*   **Suggestions for Backend Improvements:**
    *   Implement the `actual_duration` calculation.
    *   Consider adding more detailed documentation for the complex business logic in the Edge Functions.
    *   The frontend and backend teams should coordinate closely to ensure that the frontend's data requirements are met by the backend's API and that the frontend correctly handles the backend's authorization rules.
