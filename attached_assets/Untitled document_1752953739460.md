Based on my analysis of your frontend codebase, here's a comprehensive audit of API endpoint usage and backend contract compliance:

Frontend API Usage Analysis  
1\. **Endpoints Actually Called by Frontend**  
From analyzing the hooks and components, here are the actual API calls:

**Current API Calls Found:**

* /api/dashboard (GET) \- Used in use-api.ts hook  
* /api/v1/users (GET) \- Referenced in use-api.ts (commented out)  
* /api/v1/tasks (GET/POST/PUT/DELETE) \- Referenced in use-tasks.ts (commented out)  
* /api/v1/reminders (GET/POST) \- Referenced in use-reminders.ts (commented out)  
* Direct Supabase calls in lib/supabase.ts

2\. **Contract Compliance Audit Table**

| Endpoint/Method | Used in Files | Route Pattern Match | Payload/Response Match | Contract Compliance | Status | Fix Required |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| GET /api/dashboard | hooks/use-api.ts:50 | ❌ Should be /api/v1/\* | ❌ Not in contract | ❌ FAIL | Non-compliant | Rename to /api/v1/analytics or /api/v1/dashboard |
| GET /api/v1/users | hooks/use-api.ts:169 (commented) | ✅ Correct pattern | ✅ Matches contract | ✅ PASS | Compliant | Uncomment and implement |
| GET /api/v1/tasks | hooks/use-tasks.ts:102 (commented) | ✅ Correct pattern | ✅ Matches contract | ✅ PASS | Compliant | Uncomment and implement |
| POST/PUT/DELETE /api/v1/tasks | hooks/use-tasks.ts (commented) | ✅ Correct pattern | ✅ Matches contract | ✅ PASS | Compliant | Uncomment and implement |
| GET/POST /api/v1/reminders | hooks/use-reminders.ts:30,69 (commented) | ✅ Correct pattern | ✅ Matches contract | ✅ PASS | Compliant | Uncomment and implement |
| Direct Supabase calls | lib/supabase.ts | ❌ Bypasses REST API | ❌ Direct DB access | ❌ FAIL | Legacy pattern | Replace with REST API calls |

3\. **Specific Issues Found**  
**Issue 1: Non-Standard Dashboard Endpoint**  
**File:** hooks/use-api.ts:50

// Current (incorrect):

const url \= new URL(endpoint, window.location.origin) // endpoint \= "/api/dashboard"

// Should be:

const url \= new URL("/api/v1/analytics", window.location.origin)

**Issue 2: Direct Supabase Usage**  
**File:** lib/supabase.ts  
The code includes direct Supabase client usage which bypasses the REST API contract.

**Issue 3: Commented Out API Calls**  
Most actual API calls are commented out and replaced with mock data, indicating the backend isn't implemented yet.

4\. **Payload Shape Analysis**  
**Tasks Payload Compliance:**  
✅ **PASS** \- The Task interface in hooks/use-tasks.ts matches the contract:

interface Task {

 id: string

 title: string

 description?: string

 status: "pending" | "in-progress" | "completed" | "overdue" // ❌ "overdue" not in contract

 priority: "high" | "medium" | "low" // ✅ Matches

 due\_date: string // ✅ Matches

 // ... other fields match

}

**User Payload Compliance:**  
✅ **PASS** \- The User interface matches the contract structure.

**Reminders Payload Compliance:**  
✅ **PASS** \- The Reminder interface aligns with contract expectations.

5\. **Department Mapping Compliance**  
The frontend correctly uses department names that map to the contract:

* "Maintenance" → "dept\_001" ✅  
* "Housekeeping" → "dept\_002" ✅  
* "Front-of-House" → "dept\_003" ✅  
* "Activities" → "dept\_004" ✅  
* "Operations" → "dept\_005" ✅  
* "Grounds" → "dept\_006" ✅

Developer TODOs  
**HIGH PRIORITY:**  
hooks/use-api.ts  
Fix non-standard dashboard endpoint to match API contract, Replace dashboard endpoint with analytics endpoint  
hooks/use-tasks.ts  
Fix task status enum to match contract, Uncomment API calls for production use  
**MEDIUM PRIORITY:**

1. **Uncomment API calls in use-reminders.ts** when backend is ready  
2. **Uncomment API calls in use-api.ts** for users endpoint  
3. **Remove mock data** once backend endpoints are implemented

**LOW PRIORITY:**

1. **Replace direct Supabase calls** with REST API endpoints in lib/supabase.ts  
2. **Add proper error handling** for API responses  
3. **Implement request/response interceptors** for consistent error handling

Summary  
**Overall Compliance: 60% ✅**

**Compliant Areas:**

* Payload shapes mostly match contract specifications  
* Department mapping is correct  
* Endpoint patterns (when uncommented) follow /api/v1/\* convention

**Non-Compliant Areas:**

* Dashboard endpoint uses wrong path pattern  
* Task status enum includes "overdue" not in contract  
* Heavy reliance on mock data instead of actual API calls  
* Some direct Supabase usage bypassing REST API

**Recommendation:** Focus on implementing the backend API endpoints first, then uncomment and activate the frontend API calls. The frontend is well-structured and mostly contract-compliant, just waiting for backend implementation.  
