
# Backend API Catalog

*Generated: January 2025*  
*Current Version: v1*

## Overview

This document provides a complete catalog of all backend API endpoints organized by domain. Each endpoint includes HTTP method, route, purpose, payload/query structure, authorization requirements, and handler file reference.

---

## 🔐 Authentication Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/auth` | GET | Check current auth status | None | Bearer token | `api/v1/auth/route.ts` |
| `/api/v1/auth/login` | POST | Login with email/password | `{email: string, password: string}` | None | `api/v1/auth/login/route.ts` |
| `/api/v1/auth/register` | POST | Register new user account | `{email: string, password: string, name: string, department: string}` | None | `api/v1/auth/register/route.ts` |
| `/api/v1/auth/logout` | POST | Logout current user | None | Bearer token | `api/v1/auth/logout/route.ts` |

**Notes:**
- Email validation enforces `@cootclub.com` domain
- All auth endpoints return standardized response envelope
- JWT tokens issued by Supabase Auth

---

## 📋 Tasks Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/tasks` | GET | List/filter tasks | `?department, ?status, ?priority, ?search` | User+ | `api/v1/tasks/route.ts` |
| `/api/v1/tasks` | POST | Create new task | `{title, description, priority, due_date, department_id, assigned_to[]}` | User+ | `api/v1/tasks/route.ts` |
| `/api/v1/tasks/:id` | GET | Get single task | None | User+ (dept-filtered) | `api/v1/tasks/[id]/route.ts` |
| `/api/v1/tasks/:id` | PUT | Update existing task | `{title?, description?, priority?, status?, due_date?, assigned_to[]?}` | User+ (dept-filtered) | `api/v1/tasks/[id]/route.ts` |
| `/api/v1/tasks/:id` | DELETE | Delete single task | None | User+ (dept-filtered) | `api/v1/tasks/[id]/route.ts` |
| `/api/v1/tasks/bulk-complete` | POST | Mark multiple tasks complete | `{task_ids: string[]}` | User+ (dept-filtered) | `api/v1/tasks/bulk-complete/route.ts` |
| `/api/v1/tasks/bulk-delete` | POST | Delete multiple tasks | `{task_ids: string[]}` | User+ (dept-filtered) | `api/v1/tasks/bulk-delete/route.ts` |

**Status Enum:** `"pending" | "in-progress" | "completed" | "overdue"`  
**Priority Enum:** `"low" | "medium" | "high"`  
**Department Filtering:** Applied automatically based on user's department

---

## 👥 Users Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/users` | GET | List all users (dept-filtered) | `?department` | User+ | `api/v1/users/route.ts` |
| `/api/v1/users/:id` | GET | Get single user profile | None | User+ (dept-filtered) | `api/v1/users/[id]/route.ts` |
| `/api/v1/users/:id` | PUT | Update user profile | `{name?, department?, role?}` | Admin+ | `api/v1/users/[id]/route.ts` |
| `/api/v1/users/admin` | GET | Get admin dashboard data | None | Admin+ | `api/v1/users/admin/route.ts` |

**Roles:** `"user" | "admin" | "supervisor"`  
**Department IDs:** Mapped from department names via `department-mapping.ts`

---

## 📊 Analytics Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/analytics` | GET | Get analytics dashboard data | `?department, ?period` | Admin+ | `api/v1/analytics/route.ts` |

**Response Structure:**
```json
{
  "tasks_overview": {
    "total": number,
    "completed": number,
    "pending": number,
    "overdue": number
  },
  "department_stats": [...],
  "performance_metrics": {...}
}
```

---

## 📚 SOPs (Standard Operating Procedures) Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/sops` | GET | List SOPs (dept-filtered) | `?department, ?search` | User+ | `api/v1/sops/route.ts` |
| `/api/v1/sops` | POST | Create new SOP | `{title, content, department_id, file_url?}` | Admin+ | `api/v1/sops/route.ts` |
| `/api/v1/sops/:id` | GET | Get single SOP | None | User+ (dept-filtered) | `api/v1/sops/[id]/route.ts` |
| `/api/v1/sops/:id` | PUT | Update existing SOP | `{title?, content?, department_id?}` | Admin+ | `api/v1/sops/[id]/route.ts` |
| `/api/v1/sops/:id` | DELETE | Delete SOP | None | Admin+ | `api/v1/sops/[id]/route.ts` |

**File Integration:** SOPs can reference uploaded files via `/api/v1/file-upload`

---

## ⏰ Reminders Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/reminders` | GET | List user reminders | `?active_only` | User+ | `api/v1/reminders/route.ts` |
| `/api/v1/reminders` | POST | Create new reminder | `{title, message, scheduled_for, recipient_id?}` | User+ | `api/v1/reminders/route.ts` |
| `/api/v1/reminders/:id` | PUT | Update reminder | `{title?, message?, scheduled_for?, is_sent?}` | User+ (owner only) | `api/v1/reminders/[id]/route.ts` |
| `/api/v1/reminders/:id` | DELETE | Delete reminder | None | User+ (owner only) | `api/v1/reminders/[id]/route.ts` |

**Scheduling:** Uses ISO 8601 datetime format  
**Automated Processing:** Handled by Edge Function `daily-reminders`

---

## 🕐 Clock Sessions Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/clock` | GET | Get current clock session status | None | User+ | `api/v1/clock/route.ts` |
| `/api/v1/clock` | POST | Clock in/out action | `{action: "clock_in" \| "clock_out"}` | User+ | `api/v1/clock/route.ts` |

**Response Format:**
```json
{
  "current_session": {...},
  "total_hours_today": number,
  "is_clocked_in": boolean
}
```

---

## 🔍 Search Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/search` | GET | Global search across entities | `?q (required), ?type, ?department` | User+ | `api/v1/search/route.ts` |

**Search Types:** `"tasks" | "sops" | "users" | "all"`  
**Department Filtering:** Applied automatically based on user access

---

## 📅 Calendar Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/calendar` | GET | Get calendar events (tasks, reminders) | `?start_date, ?end_date, ?department` | User+ | `api/v1/calendar/route.ts` |

**Response:** Aggregated events from tasks (due dates) and reminders

---

## 💬 Feedback Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/feedback` | GET | List feedback submissions | `?department` | Admin+ | `api/v1/feedback/route.ts` |
| `/api/v1/feedback` | POST | Submit feedback | `{title, message, category, rating?}` | User+ | `api/v1/feedback/route.ts` |
| `/api/v1/feedback/:id` | GET | Get single feedback item | None | Admin+ | `api/v1/feedback/[id]/route.ts` |
| `/api/v1/feedback/:id` | PUT | Update feedback (admin response) | `{status?, admin_response?}` | Admin+ | `api/v1/feedback/[id]/route.ts` |

**Categories:** `"bug" | "feature" | "general" | "urgent"`  
**Status:** `"pending" | "in_review" | "resolved" | "dismissed"`

---

## 📁 File Upload Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/file-upload` | POST | Upload file to Supabase Storage | `FormData: {file, bucket?, folder?}` | User+ | `api/v1/file-upload/route.ts` |

**Supported Types:** PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, JPEG  
**Max Size:** 10MB per file  
**Storage:** Supabase Storage with signed URLs

---

## 📋 Audit Logs Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/audit_logs` | GET | List system audit logs | `?entity_type, ?action, ?user_id, ?start_date, ?end_date` | Admin+ | `api/v1/audit_logs/route.ts` |

**Tracked Actions:** `"CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT"`  
**Entity Types:** `"task" | "user" | "sop" | "reminder" | "feedback"`

---

## ⚡ System & Health Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/api/v1/health` | GET | System health check | None | None | `api/v1/health/route.ts` |
| `/api/openapi` | GET | OpenAPI specification | None | None | `api/openapi/route.ts` |

**Health Check Response:**
```json
{
  "status": "healthy",
  "services": {
    "database": "healthy",
    "storage": "healthy"
  },
  "metrics": {...}
}
```

---

## 🔄 Auth Callback Domain

| Endpoint | Method | Description | Payload/Query | Auth | Handler File |
|----------|--------|-------------|---------------|------|--------------|
| `/auth/callback` | GET | Handle OAuth callback | `?code, ?state` | None | `app/auth/callback/route.ts` |

**Purpose:** Handles Supabase Auth redirects after login/signup

---

## 📊 Response Format Standards

All API endpoints follow a standardized response envelope:

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Actual response data
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error information"
}
```

---

## 🔒 Authorization Matrix

| Role | Tasks | Users | SOPs | Analytics | Reminders | Clock | Feedback |
|------|-------|-------|------|-----------|-----------|-------|----------|
| **User** | CRUD (dept-filtered) | Read (dept-filtered) | Read (dept-filtered) | ❌ | CRUD (own) | CRUD (own) | Create |
| **Admin** | CRUD (all) | CRUD (all) | CRUD (all) | Read | CRUD (all) | Read (all) | CRUD (all) |
| **Supervisor** | CRUD (dept) | Read (dept) | CRUD (dept) | Read (dept) | CRUD (dept) | Read (dept) | Read (dept) |

---

## 🏗️ Department Mapping

The system uses internal department IDs that map to user-friendly names:

```javascript
{
  "Maintenance": "dept_001",
  "Housekeeping": "dept_002", 
  "Front-of-House": "dept_003",
  "Activities": "dept_004",
  "Operations": "dept_005",
  "Grounds": "dept_006"
}
```

**Implementation:** `src/utils/department-mapping.ts`

---

## 🚫 Deprecated/Legacy Routes

**None Found** - All endpoints are actively maintained and aligned with the frontend contract.

---

## 📝 Integration Notes

1. **Rate Limiting:** Applied per endpoint (see handler files for specific limits)
2. **CORS:** Enabled for all origins in development
3. **Content-Type:** All POST/PUT endpoints expect `application/json`
4. **Error Handling:** Comprehensive error catching with audit logging
5. **Validation:** Zod schemas used for all input validation (`src/utils/validation.ts`)

---

## 🔧 Development Commands

```bash
# Start backend server
npm run dev

# Run integration tests
npm test

# Test specific endpoint
node test-backend.js
```

---

**Last Updated:** January 2025  
**Total Endpoints:** 32 public endpoints  
**Handler Files:** 21 route handlers  
**Test Coverage:** Integration tests available for all domains
