# Coot Club Task Hub - Supabase Edge Functions

This directory contains all the Supabase Edge Functions for the Coot Club Task Hub backend system.

## Edge Functions Overview

### 1. Daily Reminders (`daily-reminders`)
**Purpose**: Automated daily processing of task reminders and overdue notifications

**Trigger**: 
- HTTP endpoint: `POST /functions/v1/supabase-functions-daily-reminders`
- Recommended: Daily cron job at 9:00 AM

**Environment Variables Required**:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `WHATSAPP_API_KEY` (optional - for WhatsApp integration)
- `WHATSAPP_API_URL` (optional - for WhatsApp integration)
- `EMAIL_API_KEY` (optional - for email integration)

**Testing**:
```bash
# Test the function
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-daily-reminders' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

**Deployment**:
```bash
supabase functions deploy daily-reminders
```

---

### 2. Weekly Digest (`weekly-digest`)
**Purpose**: Generate and send weekly task performance summaries to managers and admins

**Trigger**: 
- HTTP endpoint: `POST /functions/v1/supabase-functions-weekly-digest`
- Recommended: Weekly cron job on Monday mornings

**Environment Variables Required**:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `EMAIL_API_KEY` (optional - for email integration)
- `WHATSAPP_API_KEY` (optional - for WhatsApp integration)

**Testing**:
```bash
# Test the function
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-weekly-digest' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

**Deployment**:
```bash
supabase functions deploy weekly-digest
```

---

### 3. Scheduled Analytics (`scheduled-analytics`)
**Purpose**: Calculate and store key performance metrics on a scheduled basis

**Trigger**: 
- HTTP endpoint: `POST /functions/v1/supabase-functions-scheduled-analytics`
- Query parameters: `?period=daily|weekly|monthly&date=YYYY-MM-DD`
- Recommended: Daily cron job for daily metrics, weekly for weekly metrics

**Environment Variables Required**:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

**Testing**:
```bash
# Test daily analytics
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-scheduled-analytics?period=daily' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'

# Test weekly analytics
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-scheduled-analytics?period=weekly' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

**Deployment**:
```bash
supabase functions deploy scheduled-analytics
```

---

### 4. Complex Business Logic (`complex-business-logic`)
**Purpose**: Handle complex, long-running business operations that should be moved out of API routes

**Trigger**: 
- HTTP endpoint: `POST /functions/v1/supabase-functions-complex-business-logic`
- Called programmatically from your application

**Environment Variables Required**:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

**Operations Supported**:
1. **Bulk Task Assignment**: Assign multiple tasks to a user
2. **Cascade Task Completion**: Complete a task and unlock dependent tasks
3. **Department Performance Analysis**: Generate detailed department performance reports
4. **User Workload Balancing**: Analyze and recommend task redistribution
5. **Automated Task Escalation**: Escalate overdue tasks to managers
6. **Batch Reminder Creation**: Create multiple reminders at once

**Testing Examples**:
```bash
# Bulk task assignment
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-complex-business-logic' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "operation": "bulk_task_assignment",
    "task_ids": ["task1", "task2", "task3"],
    "user_id": "user123",
    "assigned_by": "manager456"
  }'

# Department performance analysis
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-complex-business-logic' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "operation": "department_performance_analysis",
    "department_id": "dept123",
    "start_date": "2024-01-01",
    "end_date": "2024-01-31"
  }'

# User workload balancing
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-complex-business-logic' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "operation": "user_workload_balancing",
    "department_id": "dept123",
    "requested_by": "manager456"
  }'
```

**Deployment**:
```bash
supabase functions deploy complex-business-logic
```

---

## Shared Modules

All functions use shared modules located in `_shared/`:

- **`cors.ts`**: CORS headers configuration
- **`database.types.ts`**: TypeScript types for Supabase database schema
- **`audit-logger.ts`**: Audit logging utilities
- **`notification-service.ts`**: Notification service abstractions (WhatsApp, Email, Push)

## Cron Job Setup

To set up automated scheduling, you can use:

1. **Supabase Cron Jobs** (if available in your plan)
2. **External cron services** like GitHub Actions, Vercel Cron, or cron-job.org
3. **Cloud provider schedulers** (AWS EventBridge, Google Cloud Scheduler, etc.)

### Example GitHub Actions Workflow

Create `.github/workflows/scheduled-functions.yml`:

```yaml
name: Scheduled Edge Functions

on:
  schedule:
    # Daily reminders at 9:00 AM UTC
    - cron: '0 9 * * *'
    # Weekly digest on Mondays at 10:00 AM UTC
    - cron: '0 10 * * 1'
    # Daily analytics at 11:00 PM UTC
    - cron: '0 23 * * *'

jobs:
  daily-reminders:
    if: github.event.schedule == '0 9 * * *'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Daily Reminders
        run: |
          curl -X POST '${{ secrets.SUPABASE_URL }}/functions/v1/supabase-functions-daily-reminders' \
            -H 'Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}' \
            -H 'Content-Type: application/json'

  weekly-digest:
    if: github.event.schedule == '0 10 * * 1'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Weekly Digest
        run: |
          curl -X POST '${{ secrets.SUPABASE_URL }}/functions/v1/supabase-functions-weekly-digest' \
            -H 'Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}' \
            -H 'Content-Type: application/json'

  daily-analytics:
    if: github.event.schedule == '0 23 * * *'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Daily Analytics
        run: |
          curl -X POST '${{ secrets.SUPABASE_URL }}/functions/v1/supabase-functions-scheduled-analytics?period=daily' \
            -H 'Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}' \
            -H 'Content-Type: application/json'
```

## Monitoring and Logging

All functions include comprehensive logging and error handling:

- **Audit Logs**: All significant actions are logged to the `audit_logs` table
- **Console Logging**: Detailed console logs for debugging
- **Error Handling**: Proper error responses with meaningful messages
- **Metrics Storage**: Analytics and performance data stored in the `analytics` table

## Security Considerations

- All functions use the `SUPABASE_SERVICE_KEY` for elevated database access
- CORS headers are properly configured
- Input validation is performed on all request data
- Audit trails are maintained for all operations
- Rate limiting should be implemented at the API gateway level

## Performance Optimization

- Functions are designed to handle batch operations efficiently
- Database queries are optimized with proper indexing
- Long-running operations are broken into smaller chunks
- Proper error handling prevents cascading failures
- Metrics collection helps identify performance bottlenecks
