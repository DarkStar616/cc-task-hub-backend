# Weekly Digest Edge Function

This edge function generates and sends weekly task performance summaries to managers and administrators.

## Features

- Aggregates weekly task statistics (completed, overdue, in-progress, pending)
- Calculates department-wise performance metrics
- Identifies top performers based on task completion
- Computes average task completion times
- Sends customized reports to managers and admins
- Stores digest data in analytics table for historical tracking
- Logs all deliveries to audit_logs

## Environment Variables Required

```bash
# Supabase Configuration (automatically available)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_role_key

# Email API Configuration (recommended for digest reports)
EMAIL_API_KEY=your_email_service_api_key
EMAIL_FROM_ADDRESS=noreply@yourcompany.com

# WhatsApp API Configuration (fallback)
WHATSAPP_API_KEY=your_whatsapp_business_api_key
WHATSAPP_API_URL=your_whatsapp_api_endpoint
```

## Invocation Methods

### 1. HTTP Endpoint (Manual Trigger)

```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-weekly-digest' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

### 2. Scheduled Trigger (Recommended)

Set up a weekly cron job to run every Monday morning:

```bash
# Example cron job (runs every Monday at 9:00 AM)
0 9 * * 1 curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-weekly-digest' -H 'Authorization: Bearer YOUR_ANON_KEY'
```

### 3. From Client Application

```typescript
const { data, error } = await supabase.functions.invoke('supabase-functions-weekly-digest')

if (error) {
  console.error('Error:', error)
} else {
  console.log('Digest Results:', data)
}
```

## Response Format

```json
{
  "success": true,
  "message": "Weekly digest generated and sent successfully",
  "results": {
    "digest_generated": true,
    "recipients_count": 3,
    "notifications_sent": 3,
    "errors": []
  },
  "digest_data": {
    "period": {
      "start": "2024-12-15T00:00:00.000Z",
      "end": "2024-12-22T00:00:00.000Z",
      "week_of": "2024-12-15"
    },
    "summary": {
      "total_tasks": 25,
      "completed_tasks": 18,
      "overdue_tasks": 2,
      "in_progress_tasks": 3,
      "pending_tasks": 2,
      "completion_rate": 72,
      "avg_completion_days": 2.3
    },
    "department_breakdown": {
      "Housekeeping": { "total": 12, "completed": 10, "overdue": 1 },
      "Front Desk": { "total": 8, "completed": 6, "overdue": 0 },
      "Maintenance": { "total": 5, "completed": 2, "overdue": 1 }
    },
    "top_performers": [
      ["john@hotel.com", 5],
      ["sarah@hotel.com", 4],
      ["mike@hotel.com", 3]
    ],
    "priority_breakdown": {
      "urgent": 2,
      "high": 8,
      "medium": 12,
      "low": 3
    }
  }
}
```

## Digest Content

The digest includes:

### Overall Summary
- Total tasks created in the week
- Completion statistics and rates
- Average completion time
- Overdue task count

### Department Breakdown
- Performance metrics per department
- Completion rates by department
- Overdue tasks by department

### Top Performers
- Users with highest task completion counts
- Recognition for outstanding performance

### Priority Analysis
- Task distribution by priority level
- Focus areas for management attention

### Manager-Specific Data
- Department managers receive additional details about their team's performance
- Customized insights for their specific department

## Recipients

Digests are sent to:
- **God**: Super administrators (all data)
- **Admin**: System administrators (all data)
- **Manager**: Department managers (all data + department-specific insights)

## Data Storage

The function automatically stores key metrics in the analytics table:
- Weekly completion rate
- Weekly task count
- Average completion time
- Full digest data as metadata

## Audit Logging

- Logs each digest delivery with recipient details
- Logs overall execution summary
- Tracks delivery methods (email/WhatsApp)
- Records any errors or failures

## Error Handling

- Individual delivery failures don't stop the entire process
- Errors are collected and returned in the response
- Failed analytics storage is logged but doesn't fail the function
- Database errors are caught and returned with appropriate status codes

## Customization

### Message Personalization
- Managers receive department-specific insights
- Role-based content customization
- Localized date formatting

### Delivery Preferences
- Email is preferred for detailed digest reports
- WhatsApp fallback for users without email
- Future: User preference settings

## Monitoring

- Check audit_logs table for delivery history
- Monitor analytics table for historical trends
- Track function execution in Supabase dashboard
- Set up alerts for delivery failures or low completion rates

## Performance Considerations

- Processes one week of data at a time
- Efficient aggregation queries
- Batched analytics storage
- Graceful error handling for large recipient lists
