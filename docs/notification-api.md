# Notification API Documentation

The Notification API provides a unified interface for sending notifications via multiple channels including WhatsApp, Email, and SMS. The system includes comprehensive RBAC, rate limiting, audit logging, and error handling.

## Table of Contents

- [Overview](#overview)
- [Authentication & Authorization](#authentication--authorization)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Testing & Mock Mode](#testing--mock-mode)
- [Adding New Providers](#adding-new-providers)
- [Examples](#examples)

## Overview

The notification system supports:

- **WhatsApp**: Fully implemented with WhatsApp Business API
- **Email**: Placeholder implementation (ready for SendGrid, AWS SES, etc.)
- **SMS**: Placeholder implementation (ready for Twilio, AWS SNS, etc.)

### Key Features

- Role-based access control (RBAC)
- Rate limiting (per user and per endpoint)
- Comprehensive audit logging
- Mock mode for development/testing
- Batch notification support
- Recipient resolution (by user ID, department, or direct contact)
- Delivery status tracking

## Authentication & Authorization

### Required Authentication

All notification endpoints require a valid authentication token. Users must be logged in to send notifications.

### Role-Based Permissions

| Role | Permissions |
|------|-------------|
| **God** | Can notify anyone, any department |
| **Admin** | Can notify anyone, any department |
| **Manager** | Can notify users in their own department only |
| **User** | Can only send notifications to themselves |
| **Guest** | No notification permissions |

## Environment Variables

### Required for Production

```bash
# WhatsApp Configuration
WHATSAPP_API_KEY=your_whatsapp_business_api_key
WHATSAPP_API_URL=https://graph.facebook.com/v18.0/YOUR_PHONE_NUMBER_ID

# Email Configuration (when implemented)
EMAIL_API_KEY=your_email_provider_api_key
EMAIL_FROM_ADDRESS=notifications@yourcompany.com
EMAIL_FROM_NAME="Your Company Name"

# SMS Configuration (when implemented)
SMS_API_KEY=your_sms_provider_api_key
SMS_FROM_NUMBER=+1234567890
```

### Development/Testing Configuration

```bash
# Enable mock mode for development
NODE_ENV=development

# Or explicitly enable mock mode for specific providers
WHATSAPP_MOCK_MODE=true
EMAIL_MOCK_MODE=true
SMS_MOCK_MODE=true
```

### Rate Limiting Configuration (Optional)

```bash
# Customize rate limits (defaults shown)
RATE_LIMIT_USER_HOUR=50
RATE_LIMIT_USER_DAY=200
RATE_LIMIT_ENDPOINT_MINUTE=100
```

## API Endpoints

### POST /api/v1/notifications

Send notifications to one or more recipients.

#### Request Body

```json
{
  "type": "whatsapp",
  "recipients": [
    {
      "user_id": "uuid-of-user"
    },
    {
      "phone": "+1234567890"
    },
    {
      "department_id": "uuid-of-department"
    }
  ],
  "message": {
    "subject": "Optional subject line",
    "body": "Your notification message here",
    "template_id": "optional-template-id",
    "variables": {
      "name": "John",
      "date": "2024-01-15"
    }
  },
  "priority": "normal",
  "scheduled_for": "2024-01-15T10:00:00Z",
  "metadata": {
    "campaign_id": "welcome-series",
    "source": "dashboard"
  }
}
```

#### Response

```json
{
  "success": true,
  "message": "Sent 3 notifications successfully, 0 failed",
  "summary": {
    "total": 3,
    "successful": 3,
    "failed": 0,
    "type": "whatsapp"
  },
  "results": [
    {
      "success": true,
      "provider": "whatsapp",
      "message_id": "wamid.ABC123",
      "delivery_status": "sent"
    }
  ],
  "rate_limit": {
    "user_remaining": 47,
    "reset_time": 1705320000000
  }
}
```

### GET /api/v1/notifications

Get notification system status and configuration.

#### Response

```json
{
  "providers": {
    "whatsapp": {
      "available": true,
      "mock_mode": false
    },
    "email": {
      "available": false,
      "mock_mode": true
    },
    "sms": {
      "available": false,
      "mock_mode": true
    }
  },
  "rate_limits": {
    "per_user_per_hour": 50,
    "per_user_per_day": 200,
    "per_endpoint_per_minute": 100,
    "user_status": {
      "allowed": true,
      "reset_time": 1705320000000
    }
  },
  "supported_types": ["whatsapp", "email", "sms"],
  "user_permissions": {
    "role": "Manager",
    "can_notify_department": true,
    "can_notify_all": false
  }
}
```

## Rate Limiting

The system implements multiple layers of rate limiting:

### User Limits
- **50 notifications per hour** per user
- **200 notifications per day** per user

### Endpoint Limits
- **100 requests per minute** for the entire `/v1/notifications` endpoint

### Customizing Rate Limits

Rate limits can be customized by modifying the `RATE_LIMITS` constant in `src/utils/notification-service.ts`:

```typescript
const RATE_LIMITS = {
  PER_USER_PER_HOUR: 50,     // Increase for high-volume users
  PER_USER_PER_DAY: 200,     // Increase for daily limits
  PER_ENDPOINT_PER_MINUTE: 100, // Increase for higher throughput
} as const;
```

### Rate Limit Headers

Rate limit information is included in API responses:

```json
{
  "rate_limit": {
    "user_remaining": 47,
    "reset_time": 1705320000000
  }
}
```

## Error Handling

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | All notifications sent successfully |
| 207 | Some notifications sent, some failed (Multi-Status) |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (authentication required) |
| 403 | Forbidden (insufficient permissions) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 503 | Service unavailable (endpoint rate limit) |

### Error Response Format

```json
{
  "error": "Validation error: recipients: At least one recipient is required"
}
```

### Common Errors

1. **Missing Recipients**
   ```json
   {
     "error": "Validation error: recipients: At least one recipient is required"
   }
   ```

2. **Invalid Notification Type**
   ```json
   {
     "error": "Validation error: type: Invalid notification type"
   }
   ```

3. **Permission Denied**
   ```json
   {
     "error": "Cannot notify users outside your department"
   }
   ```

4. **Rate Limit Exceeded**
   ```json
   {
     "error": "Rate limit exceeded. Try again after 2024-01-15T11:00:00.000Z"
   }
   ```

### Audit Logging

All notification attempts (successful and failed) are logged to the `audit_logs` table with:

- User ID and role
- Recipient information (anonymized)
- Message metadata
- Delivery status
- Error details (if any)
- IP address and user agent
- Timestamp

## Testing & Mock Mode

### Enabling Mock Mode

Mock mode allows testing without sending real notifications:

```bash
# Enable for all providers in development
NODE_ENV=development

# Or enable per provider
WHATSAPP_MOCK_MODE=true
EMAIL_MOCK_MODE=true
SMS_MOCK_MODE=true
```

### Mock Mode Behavior

- Notifications are logged to console instead of sent
- Mock message IDs are generated
- All validations still apply
- Rate limiting still enforced
- Audit logs still created

### Testing Examples

#### Test WhatsApp Notification

```bash
curl -X POST http://localhost:3000/api/v1/notifications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "type": "whatsapp",
    "recipients": [
      {"phone": "+1234567890"}
    ],
    "message": {
      "body": "Test notification from API"
    }
  }'
```

#### Test Department Notification

```bash
curl -X POST http://localhost:3000/api/v1/notifications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "type": "whatsapp",
    "recipients": [
      {"department_id": "dept-uuid-here"}
    ],
    "message": {
      "body": "Department-wide announcement"
    },
    "priority": "high"
  }'
```

## Adding New Providers

### Step 1: Create Provider Class

Create a new provider class implementing the `NotificationProvider` interface:

```typescript
// src/utils/notification-service.ts

export class NewProvider implements NotificationProvider {
  name = "new_provider";
  private apiKey: string;
  private mockMode: boolean;

  constructor() {
    this.apiKey = process.env.NEW_PROVIDER_API_KEY || "";
    this.mockMode = process.env.NODE_ENV === "development" || 
                   process.env.NEW_PROVIDER_MOCK_MODE === "true";
  }

  validateConfig(): boolean {
    if (this.mockMode) return true;
    return !!this.apiKey;
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    // Implementation here
  }
}
```

### Step 2: Register Provider

Add the provider to the NotificationService constructor:

```typescript
constructor() {
  this.providers.set("whatsapp", new WhatsAppProvider());
  this.providers.set("email", new EmailProvider());
  this.providers.set("sms", new SMSProvider());
  this.providers.set("new_provider", new NewProvider()); // Add this
}
```

### Step 3: Update Validation Schema

Add the new type to the validation schema:

```typescript
// src/utils/validation.ts

type: z.enum(["whatsapp", "email", "sms", "new_provider"], {
  required_error: "Notification type is required",
  invalid_type_error: "Invalid notification type",
}),
```

### Step 4: Add Environment Variables

Document the required environment variables:

```bash
# New Provider Configuration
NEW_PROVIDER_API_KEY=your_api_key
NEW_PROVIDER_MOCK_MODE=true  # For development
```

## Examples

### Send WhatsApp to Specific User

```javascript
const response = await fetch('/api/v1/notifications', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    type: 'whatsapp',
    recipients: [
      { user_id: 'user-uuid-here' }
    ],
    message: {
      body: 'Hello! This is a test notification.'
    },
    priority: 'normal'
  })
});

const result = await response.json();
console.log(result);
```

### Send Email to Department

```javascript
const response = await fetch('/api/v1/notifications', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    type: 'email',
    recipients: [
      { department_id: 'dept-uuid-here' }
    ],
    message: {
      subject: 'Important Department Update',
      body: 'Please review the new policies in the employee handbook.',
      template_id: 'department-announcement'
    },
    priority: 'high'
  })
});
```

### Send Urgent SMS

```javascript
const response = await fetch('/api/v1/notifications', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    type: 'sms',
    recipients: [
      { phone: '+1234567890' },
      { phone: '+0987654321' }
    ],
    message: {
      body: 'URGENT: Please report to the main office immediately.'
    },
    priority: 'urgent'
  })
});
```

### Check System Status

```javascript
const response = await fetch('/api/v1/notifications', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + token
  }
});

const status = await response.json();
console.log('Available providers:', status.providers);
console.log('Rate limits:', status.rate_limits);
console.log('User permissions:', status.user_permissions);
```

## Security Considerations

1. **API Keys**: Store all API keys in environment variables, never in code
2. **Rate Limiting**: Prevents abuse and protects against DoS attacks
3. **RBAC**: Ensures users can only notify appropriate recipients
4. **Audit Logging**: All actions are logged for security monitoring
5. **Input Validation**: All inputs are validated to prevent injection attacks
6. **Mock Mode**: Prevents accidental notifications during development

## Troubleshooting

### Common Issues

1. **"Provider not properly configured"**
   - Check environment variables are set
   - Verify API keys are valid
   - Ensure mock mode is enabled for development

2. **"Rate limit exceeded"**
   - Wait for the reset time
   - Consider increasing rate limits if needed
   - Check for runaway notification loops

3. **"Cannot notify users outside your department"**
   - Verify user role and department
   - Check recipient department assignments
   - Ensure proper RBAC configuration

4. **"No valid recipients found"**
   - Check user IDs exist in database
   - Verify department IDs are valid
   - Ensure users have required contact information

### Debug Mode

Enable debug logging by setting:

```bash
DEBUG=notifications:*
NODE_ENV=development
```

This will log detailed information about:
- Provider configuration
- Recipient resolution
- Rate limiting decisions
- API calls and responses
- Error details
