Based on my analysis of the frontend codebase, here's a comprehensive report on how the frontend expects the backend to be built:

1\. API Endpoint Usage  
Core API Endpoints (from lib/supabase.ts)

export const API\_ENDPOINTS \= {

 auth: "/api/v1/auth",

 users: "/api/v1/users",

 tasks: "/api/v1/tasks",

 sops: "/api/v1/sops",

 analytics: "/api/v1/analytics",

 reminders: "/api/v1/reminders",

 search: "/api/v1/search",

 clock: "/api/v1/clock",

 calendar: "/api/v1/calendar",

} as const

Detailed Endpoint Analysis  
**Tasks API (/api/v1/tasks)**

* GET /api/v1/tasks \- Fetch tasks with optional query parameters:  
  * department: Department filter  
  * search: Search text  
  * status: Task status filter  
  * priority: Priority filter  
* POST /api/v1/tasks \- Create new task  
  * Expected body: { title, description, priority, due\_date, owner, department\_id, assigned\_to\[\] }  
* PUT /api/v1/tasks/:id \- Update existing task  
* PATCH /api/v1/tasks/:id/complete \- Mark task as complete  
* DELETE /api/v1/tasks/:id \- Delete task  
* POST /api/v1/tasks/bulk-complete \- Bulk complete tasks  
  * Body: { task\_ids: string\[\] }  
* POST /api/v1/tasks/bulk-delete \- Bulk delete tasks  
  * Body: { task\_ids: string\[\] }

**Users API (/api/v1/users)**

* GET /api/v1/users \- Fetch all users  
* GET /api/v1/users?department=X \- Fetch users by department  
* GET /api/v1/users/admin \- Fetch admin data (requires admin role)

**Analytics API (/api/v1/analytics)**

* GET /api/v1/analytics \- Fetch analytics data  
* GET /api/v1/analytics?department=X \- Department-filtered analytics

**Clock Sessions API (/api/v1/clock\_sessions)**

* POST /api/v1/clock\_sessions \- Clock in  
  * Body: { user\_id: string }  
* PATCH /api/v1/clock\_sessions/:id/clock\_out \- Clock out

**Reminders API (/api/v1/reminders)**

* GET /api/v1/reminders \- Fetch user reminders  
* POST /api/v1/reminders \- Create reminder  
  * Body: { text, time, recurrence, channels\[\] }

2\. Data Flow and State Management  
State Management Patterns  
The frontend uses React hooks and context for state management:

**Department Context** (components/department/department-provider.tsx)

* Global department filter state shared across components  
* Affects all API calls with department parameter

**Authentication Context** (components/auth/auth-provider.tsx)

* Manages user session and profile data  
* Handles Supabase auth state changes

**Custom Hooks for API Integration**

* useApi\<T\>(endpoint, options) \- Generic API hook with department filtering  
* useMutation\<T\>(endpoint, method) \- For POST/PUT/DELETE operations  
* useTasks() \- Task-specific data fetching with filtering  
* useUsers() \- User data fetching  
* useReminders() \- Reminders management

Caching Strategy

* No explicit caching layer (relies on React state)  
* Refetch on department changes  
* Manual refresh through refetch() functions

3\. Authentication Expectations  
Authentication Flow  
The frontend expects **Supabase-based authentication**:

// Expected auth methods from Supabase client

await supabase.auth.signInWithPassword({ email, password })

await supabase.auth.signOut()

await supabase.auth.getSession()

Session Management

* Uses Supabase session management  
* Profile data fetched from profiles table after authentication  
* Auth token automatically handled by Supabase client  
* Role-based access control with roles: "god" | "admin" | "manager" | "user" | "guest"

Email Validation

* Expects @cootclub.com email domain validation  
* Helper function: isValidCootClubEmail(email)

4\. Business Logic Assumptions  
Department-Based Access Control

* All data is department-scoped  
* Department filter affects API calls globally  
* Special "All Departments" value for cross-department access

Task Management Business Rules

* Tasks have status: "pending" | "in-progress" | "completed" | "overdue"  
* Priority levels: "high" | "medium" | "low"  
* Tasks can be assigned to multiple users  
* Bulk operations supported for efficiency

Role-Based Features

* Admin panel restricted to "god" and "admin" roles  
* Different UI elements shown based on user role

5\. Data Models and Payload Shapes  
Core Interfaces  
**User Model**

interface User {

 id: string

 name: string

 email: string

 avatar?: string

 role: string

 department: string

 created\_at: string

 updated\_at: string

}

**Task Model**

interface Task {

 id: string

 title: string

 description?: string

 status: "pending" | "in-progress" | "completed" | "overdue"

 priority: "high" | "medium" | "low"

 due\_date: string

 owner: { id: string, name: string, avatar?: string }

 assignees: Array\<{ id: string, name: string, avatar?: string }\>

 tags: string\[\]

 department: string

 created\_at: string

 updated\_at: string

}

**Clock Session Model**

interface ClockSession {

 id: string

 user\_id: string

 clock\_in\_time: string

 clock\_out\_time?: string

 status: "active" | "completed"

 created\_at: string

 updated\_at: string

}

**Reminder Model**

interface Reminder {

 id: string

 text: string

 time: string

 recurrence: "daily" | "weekdays" | "custom"

 channels: { inApp: boolean, whatsapp: boolean }

 isActive: boolean

 createdAt: string

 userId: string

}

Expected Response Formats  
**Success Response Pattern**

{

 success: true,

 message: string,

 data?: any

}

**Error Response Pattern**

{

 success: false,

 message: string,

 error?: string

}

Key Implementation Notes

1. **Mock Data Strategy**: The frontend includes comprehensive mock data and API simulation, indicating the backend should match these data structures exactly.  
2. **Department Mapping**: The frontend maps department names to IDs:  
3. const departmentIdMap \= {  
4.  Maintenance: "dept\_001",  
5.  Housekeeping: "dept\_002",  
6.  "Front-of-House": "dept\_003",  
7.  Activities: "dept\_004",  
8.  Operations: "dept\_005",  
9.  Grounds: "dept\_006"  
10. }  
11. **Error Handling**: The frontend expects structured error responses and includes toast notifications for user feedback.  
12. **Authorization Headers**: All API calls should expect Authorization: Bearer ${token} headers from Supabase auth.  
13. **Database Integration**: The backend should integrate with Supabase for authentication and potentially use Supabase database for profiles table.

This analysis provides a comprehensive blueprint for building the backend API that the frontend expects, ensuring seamless integration between the two layers.

