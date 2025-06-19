# Scheduled Analytics Edge Function

This edge function processes and calculates various analytics metrics on a scheduled basis, storing results in the analytics table for historical tracking and reporting.

## Features

- **Task Completion Metrics**: Completion rates, average completion times, overdue rates
- **User Engagement Metrics**: Active user counts, session durations, productivity metrics
- **Department Performance**: Department-wise completion rates and performance tracking
- **User Performance**: Individual user productivity and completion statistics
- **Feedback Quality Metrics**: Average ratings, feedback volume, quality indicators
- **Flexible Periods**: Daily, weekly, and monthly analytics processing
- **Historical Storage**: All metrics stored with period metadata for trend analysis
- **Comprehensive Logging**: All executions logged to audit_logs

## Environment Variables Required

```bash
# Supabase Configuration (automatically available)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_role_key
```

## Invocation Methods

### 1. HTTP Endpoint with Parameters

```bash
# Daily analytics (default)
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-scheduled-analytics' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'

# Weekly analytics
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-scheduled-analytics?period=weekly' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'

# Monthly analytics
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-scheduled-analytics?period=monthly' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'

# Specific date processing
curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-scheduled-analytics?period=daily&date=2024-12-20' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

### 2. Scheduled Triggers (Recommended)

```bash
# Daily analytics (runs every day at 1:00 AM)
0 1 * * * curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-scheduled-analytics?period=daily' -H 'Authorization: Bearer YOUR_ANON_KEY'

# Weekly analytics (runs every Monday at 2:00 AM)
0 2 * * 1 curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-scheduled-analytics?period=weekly' -H 'Authorization: Bearer YOUR_ANON_KEY'

# Monthly analytics (runs on the 1st of each month at 3:00 AM)
0 3 1 * * curl -X POST 'https://your-project.supabase.co/functions/v1/supabase-functions-scheduled-analytics?period=monthly' -H 'Authorization: Bearer YOUR_ANON_KEY'
```

### 3. From Client Application

```typescript
// Daily analytics
const { data, error } = await supabase.functions.invoke('supabase-functions-scheduled-analytics')

// Weekly analytics
const { data, error } = await supabase.functions.invoke('supabase-functions-scheduled-analytics', {
  body: { period: 'weekly' }
})

// Custom date range
const { data, error } = await supabase.functions.invoke('supabase-functions-scheduled-analytics', {
  body: { period: 'daily', date: '2024-12-20' }
})
```

## Query Parameters

- `period`: Analytics period (`daily`, `weekly`, `monthly`) - Default: `daily`
- `date`: Specific date to process (ISO format: YYYY-MM-DD) - Default: today

## Response Format

```json
{
  "success": true,
  "message": "daily analytics processed successfully",
  "results": {
    "period": "daily",
    "period_start": "2024-12-21T00:00:00.000Z",
    "period_end": "2024-12-22T00:00:00.000Z",
    "metrics_calculated": 15,
    "metrics_stored": 15,
    "errors": []
  }
}
```

## Calculated Metrics

### 1. Task Completion Metrics

| Metric Name | Type | Unit | Description |
|-------------|------|------|-------------|
| `task_completion_rate` | system | percentage | Overall task completion rate for the period |
| `avg_task_completion_time` | system | hours | Average time to complete tasks |
| `task_overdue_rate` | system | percentage | Percentage of tasks that became overdue |

### 2. User Engagement Metrics

| Metric Name | Type | Unit | Description |
|-------------|------|------|-------------|
| `avg_session_duration` | system | minutes | Average clock session duration |
| `active_users_count` | system | count | Number of users who clocked in during period |
| `user_completion_rate` | user | percentage | Individual user task completion rates |

### 3. Department Performance Metrics

| Metric Name | Type | Unit | Description |
|-------------|------|------|-------------|
| `department_completion_rate` | department | percentage | Department-wise task completion rates |

### 4. Feedback Quality Metrics

| Metric Name | Type | Unit | Description |
|-------------|------|------|-------------|
| `avg_feedback_rating` | system | rating | Average feedback rating (1-5 scale) |
| `feedback_volume` | system | count | Total feedback submissions |

## Period Calculations

### Daily Analytics
- Processes data from the previous 24-hour period
- Default: Yesterday 00:00:00 to Today 00:00:00

### Weekly Analytics
- Processes data from the previous 7-day period
- Default: 7 days ago to today

### Monthly Analytics
- Processes data from the first day of the previous month
- Default: First day of current month to today

## Data Storage

All metrics are stored in the `analytics` table with:
- `metric_name`: Identifier for the metric type
- `metric_type`: Category (system, user, department, task)
- `metric_value`: Calculated numeric value
- `metric_unit`: Unit of measurement
- `period_start`/`period_end`: Time range for the calculation
- `metadata`: Additional context and breakdown data
- `user_id`/`department_id`/`task_id`: Related entity IDs where applicable

## Error Handling

- Individual metric calculation failures don't stop the entire process
- Errors are collected and returned in the response
- Failed metrics are logged but don't prevent other calculations
- Database errors are caught and returned with appropriate status codes

## Audit Logging

- Logs overall execution with period and results
- Tracks metrics calculated and stored counts
- Records any errors encountered during processing
- Includes execution metadata for debugging

## Performance Considerations

- Efficient queries with appropriate date filtering
- Batch processing for multiple metrics
- Graceful handling of large datasets
- Optimized for scheduled execution during low-traffic periods

## Monitoring and Alerting

### Key Metrics to Monitor
- Function execution success rate
- Number of metrics calculated vs stored
- Processing time for different periods
- Error rates and types

### Recommended Alerts
- Function execution failures
- Significant drops in completion rates
- High overdue rates
- Low user engagement metrics

## Usage Examples

### Daily Monitoring Dashboard
```sql
SELECT 
  metric_name,
  metric_value,
  metric_unit,
  period_start,
  metadata
FROM analytics 
WHERE metric_type = 'system' 
  AND period_start >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY period_start DESC, metric_name;
```

### Department Performance Comparison
```sql
SELECT 
  department_id,
  metadata->>'department_name' as department_name,
  metric_value as completion_rate,
  period_start
FROM analytics 
WHERE metric_name = 'department_completion_rate'
  AND period_start >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY period_start DESC, metric_value DESC;
```

### User Performance Trends
```sql
SELECT 
  user_id,
  metadata->>'user_email' as user_email,
  AVG(metric_value) as avg_completion_rate,
  COUNT(*) as periods_tracked
FROM analytics 
WHERE metric_name = 'user_completion_rate'
  AND period_start >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY user_id, metadata->>'user_email'
ORDER BY avg_completion_rate DESC;
```
