# Daily Reminders Edge Function

This edge function processes daily reminders and sends notifications for task deadlines and overdue tasks.

## Features

- Processes scheduled reminders for the current day
- Identifies and notifies users about overdue tasks
- Sends notifications via WhatsApp (preferred) or email fallback
- Logs all actions to audit_logs for tracking
- Updates reminder status after successful delivery

## Environment Variables Required

```bash
# Supabase Configuration (automatically available)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_role_key

# WhatsApp API Configuration (optional - uses mock if not configured)
WHATSAPP_API_KEY=your_whatsapp_business_api_key
WHATSAPP_API_URL=your_whatsapp_api_endpoint

# Email API Configuration (optional - uses mock if not configured)
EMAIL_API_KEY=your_email_service_api_key
```

## Invocation Methods

### 1. HTTP Endpoint (Manual Trigger)

```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-daily-reminders' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

### 2. Scheduled Trigger (Recommended)

Set up a cron job or scheduled task to call this function daily at your preferred time (e.g., 8:00 AM):

```bash
# Example cron job (runs daily at 8:00 AM)
0 8 * * * curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-daily-reminders' -H 'Authorization: Bearer YOUR_ANON_KEY'
```

### 3. From Client Application

```typescript
const { data, error } = await supabase.functions.invoke('supabase-functions-daily-reminders')

if (error) {
  console.error('Error:', error)
} else {
  console.log('Results:', data)
}
```

## Response Format

```json
{
  "success": true,
  "message": "Daily reminders processed successfully",
  "results": {
    "reminders_processed": 5,
    "overdue_notifications": 2,
    "notifications_sent": 7,
    "errors": []
  }
}
```

## Functionality Details

### Reminder Processing
- Queries all pending reminders scheduled for today
- Sends notifications to users via their preferred method (phone/email)
- Marks reminders as 'sent' after successful delivery
- Includes task details in notification messages

### Overdue Task Notifications
- Identifies tasks that are past their due date
- Calculates days overdue for context
- Sends urgent notifications to assigned users
- Includes priority and overdue duration in messages

### Audit Logging
- Logs each reminder sent with user and task context
- Logs overdue notifications with days overdue
- Logs overall execution summary with results
- All logs include system user ID for tracking

## Error Handling

- Individual reminder/task failures don't stop the entire process
- Errors are collected and returned in the response
- Failed notifications are logged but don't mark reminders as sent
- Database errors are caught and returned with appropriate status codes

## Security

- Uses Supabase service role key for database access
- Validates user permissions through database queries
- Logs all actions for audit trail
- Handles sensitive data (phone numbers, emails) securely

## Monitoring

- Check audit_logs table for execution history
- Monitor function logs in Supabase dashboard
- Track notification success rates through response data
- Set up alerts for function failures or high error rates
