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

## Best Practices

1. **Client-Side Validation**: Implement file type and size validation on the frontend
2. **Progress Indicators**: Show upload progress for better user experience
3. **Error Handling**: Provide clear error messages for failed uploads
4. **Cleanup**: Regularly clean up expired signed URLs and orphaned files
5. **Monitoring**: Monitor storage usage and file access patterns
6. **Backup**: Ensure file attachments are included in backup strategies

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
