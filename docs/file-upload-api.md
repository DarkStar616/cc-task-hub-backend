# File Upload and Attachment API Documentation

## Overview

The File Upload API provides secure endpoints for uploading, accessing, and managing file attachments for tasks, feedback, and SOPs in the Coot Club Task Hub system.

## Base URL
```
/api/v1/file-upload
```

## Authentication

All endpoints require JWT authentication. Include the authorization token in the request headers.

## File Restrictions

### Allowed File Types
- **Images**: JPG, JPEG, PNG
- **Documents**: PDF

### File Size Limits
- **Maximum file size**: 10MB per file
- **Maximum files per upload**: 5 files

### Security Measures
- Filename sanitization (prevents path traversal attacks)
- MIME type and extension validation
- Basic malware detection (executable signature checking)
- Blocked dangerous extensions (.exe, .bat, .js, etc.)

## RBAC (Role-Based Access Control)

### Permission Matrix

| Role | Own Files | Department Files | All Files | Upload to Entity | Delete Files |
|------|-----------|------------------|-----------|------------------|-------------|
| **God** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Manager** | ✅ | ✅ | ❌ | ✅ (dept only) | ✅ (dept only) |
| **User** | ✅ | ❌ | ❌ | ✅ (own only) | ✅ (own only) |

### Entity-Specific Permissions

#### Tasks
- **Upload/Delete**: Task assignee, task creator, department managers, admins, God
- **Access**: Same as upload permissions

#### Feedback
- **Upload/Delete**: Feedback creator, feedback target, managers, admins, God
- **Access**: Same as upload permissions

#### SOPs
- **Upload/Delete**: SOP creator, department managers, admins, God
- **Access**: All users in the same department, managers, admins, God

## Endpoints

### 1. Upload Files

**POST** `/api/v1/file-upload`

Upload one or more files and attach them to a specific entity (task, feedback, or SOP).

#### Request

**Content-Type**: `multipart/form-data`

**Form Fields**:
- `files` (File[]): Array of files to upload (max 5 files)
- `entity_type` (string): Type of entity (`task`, `feedback`, `sop`)
- `entity_id` (string): UUID of the entity
- `description` (string, optional): Description of the files

#### Example Request

```bash
curl -X POST \
  https://your-domain.com/api/v1/file-upload \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -F 'files=@image1.jpg' \
  -F 'files=@document.pdf' \
  -F 'entity_type=task' \
  -F 'entity_id=123e4567-e89b-12d3-a456-426614174000' \
  -F 'description=Task completion photos and documentation'
```

#### Response

**Success (201)**:
```json
{
  "message": "Successfully uploaded 2 file(s)",
  "uploaded_files": [
    {
      "file_name": "1703123456789_abc123_image1.jpg",
      "original_name": "image1.jpg",
      "file_type": "image/jpeg",
      "file_size": 2048576,
      "file_path": "tasks/123e4567-e89b-12d3-a456-426614174000/1703123456789_abc123_image1.jpg",
      "signed_url": "https://storage.supabase.co/...",
      "uploaded_at": "2024-12-22T10:30:45.123Z"
    },
    {
      "file_name": "1703123456790_def456_document.pdf",
      "original_name": "document.pdf",
      "file_type": "application/pdf",
      "file_size": 1024000,
      "file_path": "tasks/123e4567-e89b-12d3-a456-426614174000/1703123456790_def456_document.pdf",
      "signed_url": "https://storage.supabase.co/...",
      "uploaded_at": "2024-12-22T10:30:45.456Z"
    }
  ],
  "entity_type": "task",
  "entity_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Error (400)**:
```json
{
  "error": "File image.gif: unsupported file type. Only JPG, PNG, and PDF files are allowed"
}
```

**Error (403)**:
```json
{
  "error": "Insufficient permissions to upload files to this entity"
}
```

### 2. Get File Access URL

**GET** `/api/v1/file-upload`

Retrieve a signed URL to access a specific file.

#### Query Parameters
- `file_path` (string, required): Path of the file in storage
- `entity_type` (string, optional): Type of entity for permission checking
- `entity_id` (string, optional): UUID of the entity for permission checking

#### Example Request

```bash
curl -X GET \
  'https://your-domain.com/api/v1/file-upload?file_path=tasks/123e4567-e89b-12d3-a456-426614174000/1703123456789_abc123_image1.jpg&entity_type=task&entity_id=123e4567-e89b-12d3-a456-426614174000' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

#### Response

**Success (200)**:
```json
{
  "file_path": "tasks/123e4567-e89b-12d3-a456-426614174000/1703123456789_abc123_image1.jpg",
  "signed_url": "https://storage.supabase.co/object/sign/attachments/tasks/123e4567-e89b-12d3-a456-426614174000/1703123456789_abc123_image1.jpg?token=...",
  "expires_at": "2024-12-22T11:30:45.123Z"
}
```

**Error (400)**:
```json
{
  "error": "File not found"
}
```

**Error (403)**:
```json
{
  "error": "Insufficient permissions to access this file"
}
```

### 3. Delete File

**DELETE** `/api/v1/file-upload`

Delete a file from storage and remove its metadata.

#### Request Body

```json
{
  "file_path": "tasks/123e4567-e89b-12d3-a456-426614174000/1703123456789_abc123_image1.jpg",
  "entity_type": "task",
  "entity_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

#### Example Request

```bash
curl -X DELETE \
  https://your-domain.com/api/v1/file-upload \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "file_path": "tasks/123e4567-e89b-12d3-a456-426614174000/1703123456789_abc123_image1.jpg",
    "entity_type": "task",
    "entity_id": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

#### Response

**Success (200)**:
```json
{
  "message": "File deleted successfully",
  "file_path": "tasks/123e4567-e89b-12d3-a456-426614174000/1703123456789_abc123_image1.jpg"
}
```

**Error (400)**:
```json
{
  "error": "File not found"
}
```

**Error (403)**:
```json
{
  "error": "Insufficient permissions to delete this file"
}
```

## Storage Structure

Files are organized in Supabase Storage with the following structure:

```
attachments/
├── tasks/
│   └── {task_id}/
│       ├── {timestamp}_{random}_{sanitized_filename}
│       └── ...
├── feedback/
│   └── {feedback_id}/
│       ├── {timestamp}_{random}_{sanitized_filename}
│       └── ...
└── sops/
    └── {sop_id}/
        ├── {timestamp}_{random}_{sanitized_filename}
        └── ...
```

## Metadata Storage

File metadata is stored in the `attachments` field of the respective entity tables (`tasks`, `feedback`, `sops`) as a JSON array:

```json
{
  "attachments": [
    {
      "name": "1703123456789_abc123_image1.jpg",
      "original_name": "image1.jpg",
      "url": "https://storage.supabase.co/...",
      "type": "image/jpeg",
      "size": 2048576,
      "path": "tasks/123e4567-e89b-12d3-a456-426614174000/1703123456789_abc123_image1.jpg",
      "uploaded_by": "user-id-123",
      "uploaded_at": "2024-12-22T10:30:45.123Z",
      "description": "Task completion photo"
    }
  ]
}
```

## Audit Logging

All file operations are logged to the `audit_logs` table with the following information:

- **Upload**: File name, entity type/ID, file size, file path
- **Access**: File path, access timestamp
- **Delete**: File path, deletion timestamp

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 201 | File uploaded successfully |
| 400 | Bad request (validation errors, file not found) |
| 401 | Unauthorized (missing or invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 500 | Internal server error |

## Security Considerations

1. **File Type Validation**: Only approved MIME types and extensions are allowed
2. **Size Limits**: Prevents large file uploads that could impact performance
3. **Filename Sanitization**: Prevents path traversal and injection attacks
4. **Malware Detection**: Basic signature-based detection for executables
5. **Access Control**: Strict RBAC enforcement for all operations
6. **Audit Logging**: Complete audit trail for compliance and security monitoring
7. **Signed URLs**: Temporary access URLs that expire after 1 hour
8. **Storage Isolation**: Files are organized by entity type and ID

## Rate Limiting

Consider implementing rate limiting for file upload endpoints to prevent abuse:

- **Upload**: 10 requests per minute per user
- **Access**: 100 requests per minute per user
- **Delete**: 5 requests per minute per user

## Rate Limiting

The File Upload API implements rate limiting to prevent abuse and ensure system stability:

### Rate Limit Configuration

| Endpoint | Window | Max Requests | Scope |
|----------|--------|--------------|-------|
| `POST /api/v1/file-upload` | 1 minute | 10 requests | Per user/IP |
| `GET /api/v1/file-upload` | 1 minute | 50 requests | Per user/IP |
| `DELETE /api/v1/file-upload` | 1 minute | 5 requests | Per user/IP |

### Rate Limit Headers

All responses include rate limit information:

```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 2024-12-22T11:30:45.123Z
```

### Rate Limit Exceeded Response

**Status Code**: `429 Too Many Requests`

```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Try again in 45 seconds.",
  "limit": 10,
  "remaining": 0,
  "resetTime": "2024-12-22T11:30:45.123Z"
}
```

**Headers**:
```http
Retry-After: 45
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2024-12-22T11:30:45.123Z
```

### Environment Variables

Rate limits can be configured via environment variables:

```bash
# File upload rate limits
RATE_LIMIT_FILE_UPLOAD_MAX=10    # Max requests per minute
RATE_LIMIT_DEFAULT_MAX=100       # Default fallback limit

# Authentication rate limits (stricter)
RATE_LIMIT_AUTH_MAX=5            # Login attempts per 15 minutes
RATE_LIMIT_SIGNUP_MAX=3          # Signups per hour
RATE_LIMIT_PASSWORD_RESET_MAX=3  # Password resets per hour

# Other API endpoints
RATE_LIMIT_USERS_MAX=30          # User management
RATE_LIMIT_TASKS_MAX=50          # Task operations
RATE_LIMIT_NOTIFICATIONS_MAX=20  # Notifications
```

## Monitoring and Error Tracking

### Sentry Integration

The API integrates with Sentry for comprehensive error tracking and performance monitoring:

#### Error Tracking
- All API errors are automatically captured
- Request context (endpoint, method, user ID) is included
- Performance metrics are tracked for slow endpoints

#### Performance Monitoring
- Response time tracking for all endpoints
- Slow query detection (>5 seconds warning, >10 seconds critical)
- Database operation monitoring

#### Setup

1. **Environment Variables**:
```bash
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project-id
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
SENTRY_AUTH_TOKEN=your-auth-token
```

2. **Alert Configuration**:
   - Error rate > 5% triggers alert
   - Response time > 10s triggers alert
   - Rate limit violations are tracked

### Health Monitoring

Health check endpoint: `GET /api/v1/health`

```json
{
  "status": "healthy",
  "timestamp": "2024-12-22T10:30:45.123Z",
  "services": {
    "database": "healthy",
    "storage": "healthy",
    "redis": "healthy"
  },
  "metrics": {
    "responseTime": 45,
    "memoryUsage": "67%",
    "activeConnections": 12
  }
}
```

## Automated Backups & Disaster Recovery

### Backup Strategy

Critical data is automatically backed up using the included backup scripts:

#### Tables Included in Backups
- `users` - User accounts and profiles
- `tasks` - Task data and assignments
- `audit_logs` - Security and compliance logs
- `feedback` - User feedback and ratings
- `sops` - Standard operating procedures
- `attachments` - File metadata (files backed up separately)

#### Backup Schedule

```bash
# Daily backups at 2 AM UTC
0 2 * * * /usr/bin/node /path/to/scripts/backup-database.js --compress --verbose

# Weekly full backup on Sundays at 1 AM UTC
0 1 * * 0 /usr/bin/node /path/to/scripts/backup-database.js --format sql --compress
```

#### Backup Configuration

**Environment Variables**:
```bash
BACKUP_STORAGE_PATH=/backups/coot-club
BACKUP_RETENTION_DAYS=30
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```

### Backup Commands

#### Create Backup
```bash
# Backup all critical tables
node scripts/backup-database.js --verbose

# Backup specific tables with compression
node scripts/backup-database.js --tables users,tasks,audit_logs --compress

# Custom output directory
node scripts/backup-database.js --output /custom/backup/path
```

#### Restore from Backup
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

### Disaster Recovery Procedures

#### 1. Data Loss Recovery

```bash
# Step 1: Assess the situation
node scripts/backup-database.js --tables audit_logs --verbose

# Step 2: Find latest good backup
ls -la /backups/coot-club/ | grep $(date -d "yesterday" +%Y-%m-%d)

# Step 3: Restore critical tables first
node scripts/restore-database.js --backup /backups/users_latest.json --force
node scripts/restore-database.js --backup /backups/tasks_latest.json --force

# Step 4: Verify data integrity
node scripts/backup-database.js --tables users,tasks --dry-run
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

## Best Practices

1. **Client-Side Validation**: Implement file type and size validation on the frontend
2. **Progress Indicators**: Show upload progress for better user experience
3. **Error Handling**: Provide clear error messages for failed uploads
4. **Rate Limit Awareness**: Implement exponential backoff for rate-limited requests
5. **Monitoring**: Set up alerts for error rates and performance degradation
6. **Backup Verification**: Regularly test backup and restore procedures
7. **Security**: Monitor for unusual patterns in rate limit violations
8. **Cleanup**: Regularly clean up expired signed URLs and orphaned files

## Integration Examples

### JavaScript/TypeScript

```typescript
// Upload files
async function uploadFiles(files: FileList, entityType: string, entityId: string) {
  const formData = new FormData();
  
  Array.from(files).forEach(file => {
    formData.append('files', file);
  });
  
  formData.append('entity_type', entityType);
  formData.append('entity_id', entityId);
  formData.append('description', 'Task completion files');
  
  const response = await fetch('/api/v1/file-upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  return response.json();
}

// Get file access URL
async function getFileUrl(filePath: string, entityType?: string, entityId?: string) {
  const params = new URLSearchParams({ file_path: filePath });
  if (entityType) params.append('entity_type', entityType);
  if (entityId) params.append('entity_id', entityId);
  
  const response = await fetch(`/api/v1/file-upload?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return response.json();
}

// Delete file
async function deleteFile(filePath: string, entityType?: string, entityId?: string) {
  const response = await fetch('/api/v1/file-upload', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      file_path: filePath,
      entity_type: entityType,
      entity_id: entityId
    })
  });
  
  return response.json();
}
```

### React Component Example

```tsx
import React, { useState } from 'react';

interface FileUploadProps {
  entityType: 'task' | 'feedback' | 'sop';
  entityId: string;
  onUploadComplete: (files: any[]) => void;
}

export function FileUpload({ entityType, entityId, onUploadComplete }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // Validate files on client side
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    for (const file of Array.from(files)) {
      if (!allowedTypes.includes(file.type)) {
        setError(`File ${file.name} has unsupported type. Only JPG, PNG, and PDF are allowed.`);
        return;
      }
      if (file.size > maxSize) {
        setError(`File ${file.name} is too large. Maximum size is 10MB.`);
        return;
      }
    }
    
    setUploading(true);
    setError(null);
    
    try {
      const result = await uploadFiles(files, entityType, entityId);
      if (result.uploaded_files) {
        onUploadComplete(result.uploaded_files);
      }
      if (result.errors) {
        setError(result.errors.join(', '));
      }
    } catch (err) {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div className="file-upload">
      <input
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.pdf"
        onChange={handleFileUpload}
        disabled={uploading}
      />
      {uploading && <p>Uploading files...</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```
