# Operational Safeguards Documentation

This document outlines the advanced operational safeguards implemented in the Coot Club Task Hub backend system.

## Overview

The operational safeguards include:
1. **Rate Limiting** - Prevents API abuse and ensures system stability
2. **Monitoring & Error Tracking** - Real-time error detection and performance monitoring
3. **Automated Backups** - Scheduled data backups and disaster recovery procedures

## Rate Limiting

### Implementation

Rate limiting is implemented using an in-memory store with configurable limits per endpoint. For production deployments, consider using Redis for distributed rate limiting.

### Configuration

Rate limits are configured via environment variables:

```bash
# Authentication endpoints (stricter limits)
RATE_LIMIT_AUTH_MAX=5            # Login attempts per 15 minutes
RATE_LIMIT_SIGNUP_MAX=3          # Signups per hour
RATE_LIMIT_PASSWORD_RESET_MAX=3  # Password resets per hour

# File operations
RATE_LIMIT_FILE_UPLOAD_MAX=10    # File uploads per minute

# API endpoints
RATE_LIMIT_USERS_MAX=30          # User management per minute
RATE_LIMIT_TASKS_MAX=50          # Task operations per minute
RATE_LIMIT_NOTIFICATIONS_MAX=20  # Notifications per minute
RATE_LIMIT_FEEDBACK_MAX=20       # Feedback per minute
RATE_LIMIT_REMINDERS_MAX=25      # Reminders per minute
RATE_LIMIT_CLOCK_MAX=15          # Clock sessions per minute
RATE_LIMIT_ANALYTICS_MAX=10      # Analytics per minute
RATE_LIMIT_AUDIT_MAX=10          # Audit logs per minute

# Default fallback
RATE_LIMIT_DEFAULT_MAX=100       # Default limit per minute
```

### Rate Limit Matrix

| Endpoint | Window | Max Requests | Notes |
|----------|--------|--------------|-------|
| `/api/auth/sign-in` | 15 minutes | 5 | Prevents brute force |
| `/api/auth/sign-up` | 1 hour | 3 | Prevents spam accounts |
| `/api/auth/forgot-password` | 1 hour | 3 | Prevents abuse |
| `/api/v1/file-upload` | 1 minute | 10 | Prevents storage abuse |
| `/api/v1/notifications` | 1 minute | 20 | Prevents spam |
| `/api/v1/users` | 1 minute | 30 | General API usage |
| `/api/v1/tasks` | 1 minute | 50 | High-usage endpoint |
| `/api/v1/sops` | 1 minute | 30 | Document management |
| `/api/v1/feedback` | 1 minute | 20 | Feedback submission |
| `/api/v1/reminders` | 1 minute | 25 | Reminder management |
| `/api/v1/clock_sessions` | 1 minute | 15 | Time tracking |
| `/api/v1/analytics` | 1 minute | 10 | Resource-intensive |
| `/api/v1/audit_logs` | 1 minute | 10 | Security-sensitive |

### Role-Based Rate Limits

Different user roles have different rate limits:

- **God Role**: Highest limits (up to 200 requests/minute for tasks)
- **Admin Role**: High limits (up to 150 requests/minute for tasks)
- **Manager Role**: Moderate limits (up to 100 requests/minute for tasks)
- **User/Guest**: Standard limits as defined above

### Rate Limit Headers

All API responses include rate limit information:

```http
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 47
X-RateLimit-Reset: 2024-12-22T11:30:45.123Z
```

### Rate Limit Exceeded Response

**Status Code**: `429 Too Many Requests`

```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Try again in 45 seconds.",
  "limit": 50,
  "remaining": 0,
  "resetTime": "2024-12-22T11:30:45.123Z"
}
```

**Headers**:
```http
Retry-After: 45
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2024-12-22T11:30:45.123Z
```

### Audit Logging

Rate limit violations are logged to the `audit_logs` table for security analysis:

```json
{
  "table_name": "rate_limits",
  "action": "INSERT",
  "new_values": {
    "endpoint": "/api/v1/tasks",
    "client_id": "user:123e4567-e89b-12d3-a456-426614174000",
    "limit_exceeded": true,
    "current_count": 51,
    "max_requests": 50,
    "window_ms": 60000
  },
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "created_at": "2024-12-22T10:30:45.123Z"
}
```

## Monitoring and Error Tracking

### Sentry Integration

The system uses Sentry for comprehensive error tracking and performance monitoring.

#### Setup

1. **Install Dependencies**:
```bash
npm install @sentry/nextjs @sentry/node @sentry/tracing
```

2. **Environment Variables**:
```bash
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project-id
SENTRY_ORG=your-organization
SENTRY_PROJECT=your-project
SENTRY_AUTH_TOKEN=your-auth-token
```

3. **Configuration Files**:
   - `sentry.client.config.ts` - Client-side configuration
   - `sentry.server.config.ts` - Server-side configuration
   - `sentry.edge.config.ts` - Edge runtime configuration

#### Features

**Error Tracking**:
- Automatic error capture for all API endpoints
- Request context (endpoint, method, user ID) included
- Sensitive data filtering (authorization headers, cookies)

**Performance Monitoring**:
- Response time tracking for all endpoints
- Slow operation detection (>5s warning, >10s critical)
- Database query performance monitoring

**Custom Monitoring**:
```typescript
import { PerformanceMonitor, captureApiError } from '@/utils/monitoring';

// Monitor API endpoint
const monitoredHandler = monitorApiEndpoint('/api/v1/tasks', 'GET', async (req) => {
  // Your handler code
});

// Monitor database queries
const result = await monitorDatabaseQuery('fetch_user_tasks', async () => {
  return supabase.from('tasks').select('*').eq('user_id', userId);
});

// Capture business logic errors
captureBusinessLogicError(error, {
  operation: 'task_assignment',
  userId: '123',
  entityId: 'task-456',
  entityType: 'task'
});
```

#### Alert Configuration

Sentry alerts are configured for:
- Error rate > 5% in 5-minute window
- Response time > 10 seconds
- Rate limit violations > 100 per hour
- Database connection failures
- File upload failures > 10%

### Health Monitoring

**Health Check Endpoint**: `GET /api/v1/health`

```json
{
  "status": "healthy",
  "timestamp": "2024-12-22T10:30:45.123Z",
  "services": {
    "database": "healthy",
    "storage": "healthy",
    "redis": "degraded"
  },
  "metrics": {
    "responseTime": 45,
    "memoryUsage": "67%",
    "activeConnections": 12,
    "rateLimitViolations": 3
  }
}
```

### Performance Metrics

The system tracks and reports:
- API endpoint response times (average, P95, P99)
- Database query performance
- File upload/download speeds
- Rate limit hit rates
- Error rates by endpoint

## Automated Backups & Disaster Recovery

### Backup Strategy

**Critical Tables**:
- `users` - User accounts and profiles
- `roles` - User roles and permissions
- `departments` - Organizational structure
- `tasks` - Task data and assignments
- `sops` - Standard operating procedures
- `clock_sessions` - Time tracking data
- `reminders` - Scheduled reminders
- `feedback` - User feedback and ratings
- `audit_logs` - Security and compliance logs
- `analytics` - Performance metrics
- `notifications` - Notification history

### Backup Scripts

#### Database Backup Script

**Location**: `scripts/backup-database.js`

**Usage**:
```bash
# Basic backup (all critical tables)
node scripts/backup-database.js --verbose

# Specific tables with compression
node scripts/backup-database.js --tables users,tasks,audit_logs --compress

# Custom output directory
node scripts/backup-database.js --output /custom/backup/path --format json

# SQL format backup
node scripts/backup-database.js --format sql --compress
```

**Options**:
- `--tables <table1,table2>` - Specific tables to backup
- `--output <path>` - Output directory (default: ./backups)
- `--compress` - Compress backup files with gzip
- `--retention <days>` - Delete backups older than N days (default: 30)
- `--format <json|sql>` - Backup format (default: json)
- `--verbose` - Verbose logging

#### Database Restore Script

**Location**: `scripts/restore-database.js`

**Usage**:
```bash
# Restore from backup directory (interactive)
node scripts/restore-database.js --backup ./backups

# Restore specific table
node scripts/restore-database.js --backup ./backups/users_2024-01-01.json --table users

# Dry run (preview changes)
node scripts/restore-database.js --backup ./backups --dry-run

# Force restore without prompts
node scripts/restore-database.js --backup ./backups --force
```

**Options**:
- `--backup <path>` - Path to backup file or directory (required)
- `--table <name>` - Restore specific table only
- `--dry-run` - Show what would be restored without executing
- `--force` - Skip confirmation prompts
- `--verbose` - Verbose logging

### Backup Schedule

**Recommended Cron Jobs**:

```bash
# Daily backups at 2 AM UTC (compressed JSON)
0 2 * * * /usr/bin/node /path/to/scripts/backup-database.js --compress --verbose >> /var/log/backup.log 2>&1

# Weekly full backup on Sundays at 1 AM UTC (SQL format)
0 1 * * 0 /usr/bin/node /path/to/scripts/backup-database.js --format sql --compress --verbose >> /var/log/backup-weekly.log 2>&1

# Monthly archive backup (first day of month at midnight)
0 0 1 * * /usr/bin/node /path/to/scripts/backup-database.js --output /archives/$(date +\%Y-\%m) --compress --verbose
```

### Environment Variables

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Optional
BACKUP_STORAGE_PATH=/backups/coot-club
BACKUP_RETENTION_DAYS=30
```

### Disaster Recovery Procedures

#### 1. Complete Data Loss Recovery

```bash
# Step 1: Assess the situation
node scripts/backup-database.js --tables audit_logs --verbose

# Step 2: Find latest good backup
ls -la /backups/coot-club/ | head -20

# Step 3: Restore critical tables first (in order)
node scripts/restore-database.js --backup /backups/roles_latest.json --force
node scripts/restore-database.js --backup /backups/departments_latest.json --force
node scripts/restore-database.js --backup /backups/users_latest.json --force
node scripts/restore-database.js --backup /backups/tasks_latest.json --force

# Step 4: Restore remaining tables
node scripts/restore-database.js --backup /backups/latest/ --force

# Step 5: Verify data integrity
curl -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
     "$SUPABASE_URL/rest/v1/users?select=count"
```

#### 2. Point-in-Time Recovery

```bash
# Restore to specific date
node scripts/restore-database.js --backup /backups/2024-01-15/ --force

# Verify restoration
curl -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
     "$SUPABASE_URL/rest/v1/users?select=count"
```

#### 3. Partial Recovery

```bash
# Restore only specific table
node scripts/restore-database.js --backup /backups/ --table audit_logs

# Restore with confirmation
node scripts/restore-database.js --backup /backups/critical_data.json
```

### Backup Monitoring

Backup operations are monitored and logged:

- **Success/Failure Notifications**: Sent via configured notification channels
- **Backup Size Tracking**: Monitor backup file sizes for anomalies
- **Retention Policy**: Automatic cleanup of old backups
- **Integrity Checks**: Periodic verification of backup files

### Backup File Structure

**JSON Format**:
```json
{
  "table": "users",
  "timestamp": "2024-12-22T10:30:45.123Z",
  "recordCount": 1250,
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "user@example.com",
      "created_at": "2024-01-15T08:30:00.000Z",
      "updated_at": "2024-12-20T14:22:15.000Z"
    }
  ]
}
```

**Manifest File** (`backup-manifest.json`):
```json
{
  "timestamp": "2024-12-22T10:30:45.123Z",
  "version": "1.0",
  "config": {
    "format": "json",
    "compressed": true,
    "retentionDays": 30
  },
  "backups": [
    {
      "table": "users",
      "filename": "users_2024-12-22T10-30-45-123Z.json.gz",
      "recordCount": 1250,
      "size": 245760
    }
  ],
  "totalTables": 11,
  "totalRecords": 15420
}
```

## Security Considerations

### Rate Limiting Security

1. **IP-based Limiting**: Fallback to IP address when user authentication is not available
2. **User-based Limiting**: More accurate limiting for authenticated users
3. **Audit Trail**: All rate limit violations are logged for security analysis
4. **Graduated Responses**: Different limits for different user roles

### Monitoring Security

1. **Data Sanitization**: Sensitive data is filtered from error reports
2. **Access Control**: Monitoring dashboards require authentication
3. **Alert Thresholds**: Configured to detect potential security incidents
4. **Retention Policies**: Error data is retained according to compliance requirements

### Backup Security

1. **Encryption**: Backup files should be encrypted at rest
2. **Access Control**: Backup storage requires service-level authentication
3. **Audit Logging**: All backup and restore operations are logged
4. **Data Retention**: Backups are automatically cleaned up according to policy

## Troubleshooting

### Rate Limiting Issues

**Problem**: Users hitting rate limits unexpectedly

**Solutions**:
1. Check rate limit configuration in environment variables
2. Review audit logs for unusual patterns
3. Consider adjusting limits for specific user roles
4. Implement exponential backoff in client applications

**Problem**: Rate limiting not working

**Solutions**:
1. Verify middleware is properly configured
2. Check that environment variables are set
3. Review server logs for rate limiter errors
4. Consider switching to Redis for distributed environments

### Monitoring Issues

**Problem**: Sentry not capturing errors

**Solutions**:
1. Verify `NEXT_PUBLIC_SENTRY_DSN` is set correctly
2. Check network connectivity to Sentry
3. Review Sentry project configuration
4. Test with manual error capture

**Problem**: Performance metrics not updating

**Solutions**:
1. Check that monitoring utilities are imported correctly
2. Verify database connections are working
3. Review server logs for monitoring errors
4. Test with manual metric recording

### Backup Issues

**Problem**: Backup script failing

**Solutions**:
1. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set
2. Check database connectivity
3. Verify output directory permissions
4. Review backup script logs

**Problem**: Restore script failing

**Solutions**:
1. Verify backup file integrity
2. Check database permissions for data insertion
3. Review table schemas for compatibility
4. Test with smaller datasets first

## Best Practices

### Rate Limiting

1. **Monitor Usage Patterns**: Regularly review rate limit metrics
2. **Adjust Limits**: Fine-tune limits based on actual usage
3. **Client-Side Handling**: Implement proper retry logic with exponential backoff
4. **Documentation**: Keep rate limit documentation up to date

### Monitoring

1. **Alert Fatigue**: Configure alerts to avoid noise
2. **Regular Reviews**: Periodically review error patterns and performance metrics
3. **Incident Response**: Have clear procedures for handling alerts
4. **Data Retention**: Balance monitoring needs with storage costs

### Backups

1. **Regular Testing**: Periodically test backup and restore procedures
2. **Multiple Locations**: Store backups in multiple locations
3. **Automation**: Automate backup processes to ensure consistency
4. **Documentation**: Keep recovery procedures well-documented and accessible

## Maintenance

### Regular Tasks

**Daily**:
- Review error rates and performance metrics
- Check backup completion status
- Monitor rate limit violation patterns

**Weekly**:
- Review and analyze error trends
- Test backup integrity
- Update rate limit configurations if needed

**Monthly**:
- Perform disaster recovery drills
- Review and update monitoring alerts
- Clean up old backup files
- Update documentation

**Quarterly**:
- Review overall system performance
- Update operational procedures
- Conduct security reviews
- Plan capacity upgrades

### Configuration Updates

When updating operational safeguards:

1. **Test in Staging**: Always test changes in a staging environment first
2. **Gradual Rollout**: Implement changes gradually to monitor impact
3. **Rollback Plan**: Have a clear rollback plan for each change
4. **Documentation**: Update documentation immediately after changes
5. **Team Communication**: Notify team members of operational changes

## Conclusion

The operational safeguards implemented in the Coot Club Task Hub provide comprehensive protection against common operational risks. Regular monitoring, testing, and maintenance of these systems ensure continued reliability and security of the platform.

For additional support or questions about these operational safeguards, please refer to the team documentation or contact the system administrators.
