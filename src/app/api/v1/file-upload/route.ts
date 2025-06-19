import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createBadRequestResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";
import { logAuditEntry, SENSITIVE_ACTIONS } from "@/utils/audit-log";
import { z } from "zod";

// File upload configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_UPLOAD = 5;
const ALLOWED_FILE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/pdf": [".pdf"],
};

// Dangerous file extensions to block
const BLOCKED_EXTENSIONS = [
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".pif",
  ".vbs",
  ".js",
  ".jar",
  ".app",
  ".deb",
  ".pkg",
  ".dmg",
  ".sh",
  ".ps1",
  ".msi",
  ".dll",
];

// Malware signatures (basic executable detection)
const MALWARE_SIGNATURES = [
  Buffer.from([0x4d, 0x5a]), // PE executable (MZ)
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // ELF executable
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]), // Mach-O executable
];

// Validation schemas
const fileUploadSchema = z.object({
  entity_type: z.enum(["task", "feedback", "sop"]),
  entity_id: z.string().uuid("Invalid entity ID"),
  description: z.string().optional(),
});

const fileAccessSchema = z.object({
  file_path: z.string().min(1, "File path is required"),
  entity_type: z.enum(["task", "feedback", "sop"]).optional(),
  entity_id: z.string().uuid().optional(),
});

const fileDeleteSchema = z.object({
  file_path: z.string().min(1, "File path is required"),
  entity_type: z.enum(["task", "feedback", "sop"]).optional(),
  entity_id: z.string().uuid().optional(),
});

// Utility functions
function sanitizeFilename(filename: string): string {
  // Remove path traversal attempts and dangerous characters
  return filename
    .replace(/[\\\/:*?"<>|]/g, "_")
    .replace(/\.\.+/g, "_")
    .replace(/^\.|\.$/, "_")
    .substring(0, 255);
}

function validateFileType(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  const extension = "." + file.name.split(".").pop()?.toLowerCase();

  // Check if MIME type is allowed
  if (!ALLOWED_FILE_TYPES[mimeType as keyof typeof ALLOWED_FILE_TYPES]) {
    return false;
  }

  // Check if extension matches MIME type
  const allowedExtensions =
    ALLOWED_FILE_TYPES[mimeType as keyof typeof ALLOWED_FILE_TYPES];
  return allowedExtensions.includes(extension);
}

function isBlockedExtension(filename: string): boolean {
  const extension = "." + filename.split(".").pop()?.toLowerCase();
  return BLOCKED_EXTENSIONS.includes(extension);
}

async function detectMalware(buffer: ArrayBuffer): Promise<boolean> {
  const fileBuffer = Buffer.from(buffer);

  // Check for known malware signatures
  for (const signature of MALWARE_SIGNATURES) {
    if (fileBuffer.subarray(0, signature.length).equals(signature)) {
      return true;
    }
  }

  return false;
}

async function checkEntityPermissions(
  authContext: any,
  entityType: string,
  entityId: string,
  action: "read" | "write",
): Promise<{ allowed: boolean; entity?: any }> {
  const { user, supabase } = authContext;

  if (!user) {
    return { allowed: false };
  }

  // God can access everything
  if (user.role === "God") {
    return { allowed: true };
  }

  let query;
  let entityData;

  switch (entityType) {
    case "task":
      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("id, assigned_to, created_by, department_id")
        .eq("id", entityId)
        .single();

      if (taskError || !taskData) {
        return { allowed: false };
      }

      entityData = taskData;

      // Users can access their own tasks or tasks they created
      if (taskData.assigned_to === user.id || taskData.created_by === user.id) {
        return { allowed: true, entity: entityData };
      }

      // Managers can access tasks in their department
      if (
        hasRole(user.role, ["Manager", "Admin"]) &&
        taskData.department_id === user.department_id
      ) {
        return { allowed: true, entity: entityData };
      }

      // Admins can access all tasks
      if (hasRole(user.role, ["Admin"])) {
        return { allowed: true, entity: entityData };
      }

      break;

    case "feedback":
      const { data: feedbackData, error: feedbackError } = await supabase
        .from("feedback")
        .select("id, user_id, target_user_id")
        .eq("id", entityId)
        .single();

      if (feedbackError || !feedbackData) {
        return { allowed: false };
      }

      entityData = feedbackData;

      // Users can access feedback they created or feedback about them
      if (
        feedbackData.user_id === user.id ||
        feedbackData.target_user_id === user.id
      ) {
        return { allowed: true, entity: entityData };
      }

      // Managers and admins can access all feedback
      if (hasRole(user.role, ["Manager", "Admin"])) {
        return { allowed: true, entity: entityData };
      }

      break;

    case "sop":
      const { data: sopData, error: sopError } = await supabase
        .from("sops")
        .select("id, created_by, department_id")
        .eq("id", entityId)
        .single();

      if (sopError || !sopData) {
        return { allowed: false };
      }

      entityData = sopData;

      // For read access, users can access SOPs in their department
      if (action === "read" && sopData.department_id === user.department_id) {
        return { allowed: true, entity: entityData };
      }

      // For write access, only creators, managers, and admins
      if (action === "write") {
        if (
          sopData.created_by === user.id ||
          hasRole(user.role, ["Manager", "Admin"])
        ) {
          return { allowed: true, entity: entityData };
        }
      }

      break;
  }

  return { allowed: false };
}

// POST - Upload files
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const entityType = formData.get("entity_type") as string;
    const entityId = formData.get("entity_id") as string;
    const description = formData.get("description") as string;

    // Validate form data
    const validation = fileUploadSchema.safeParse({
      entity_type: entityType,
      entity_id: entityId,
      description: description,
    });

    if (!validation.success) {
      return createBadRequestResponse(
        validation.error.errors.map((e) => e.message).join(", "),
      );
    }

    // Check file count
    if (files.length === 0) {
      return createBadRequestResponse("No files provided");
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
      return createBadRequestResponse(
        `Maximum ${MAX_FILES_PER_UPLOAD} files allowed per upload`,
      );
    }

    // Check entity permissions
    const permissionCheck = await checkEntityPermissions(
      authContext,
      validation.data.entity_type,
      validation.data.entity_id,
      "write",
    );

    if (!permissionCheck.allowed) {
      return createForbiddenResponse(
        "Insufficient permissions to upload files to this entity",
      );
    }

    const uploadResults = [];
    const errors = [];

    for (const file of files) {
      try {
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          errors.push(
            `File ${file.name}: exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          );
          continue;
        }

        // Validate file type
        if (!validateFileType(file)) {
          errors.push(
            `File ${file.name}: unsupported file type. Only JPG, PNG, and PDF files are allowed`,
          );
          continue;
        }

        // Check for blocked extensions
        if (isBlockedExtension(file.name)) {
          errors.push(`File ${file.name}: blocked file extension`);
          continue;
        }

        // Sanitize filename
        const sanitizedName = sanitizeFilename(file.name);

        // Read file buffer for malware detection
        const arrayBuffer = await file.arrayBuffer();

        // Basic malware detection
        if (await detectMalware(arrayBuffer)) {
          errors.push(`File ${file.name}: potential security threat detected`);
          continue;
        }

        // Generate unique file path
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
        const uniqueFileName = `${timestamp}_${randomSuffix}_${sanitizedName}`;
        const filePath = `${validation.data.entity_type}s/${validation.data.entity_id}/${uniqueFileName}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } =
          await authContext.supabase.storage
            .from("attachments")
            .upload(filePath, arrayBuffer, {
              contentType: file.type,
              duplex: "half",
            });

        if (uploadError) {
          errors.push(
            `File ${file.name}: upload failed - ${uploadError.message}`,
          );
          continue;
        }

        // Generate signed URL (valid for 1 hour)
        const { data: signedUrlData, error: signedUrlError } =
          await authContext.supabase.storage
            .from("attachments")
            .createSignedUrl(filePath, 3600);

        if (signedUrlError) {
          errors.push(`File ${file.name}: failed to generate access URL`);
          continue;
        }

        // Store file metadata in database
        const fileMetadata = {
          file_name: sanitizedName,
          original_name: file.name,
          file_type: file.type,
          file_size: file.size,
          file_path: filePath,
          entity_type: validation.data.entity_type,
          entity_id: validation.data.entity_id,
          uploaded_by: authContext.user.id,
          signed_url: signedUrlData.signedUrl,
          description: description || null,
          created_at: new Date().toISOString(),
        };

        // Update the entity's attachments field
        const currentEntity = await authContext.supabase
          .from(`${validation.data.entity_type}s`)
          .select("attachments")
          .eq("id", validation.data.entity_id)
          .single();

        const currentAttachments = currentEntity.data?.attachments || [];
        const updatedAttachments = [
          ...currentAttachments,
          {
            name: fileMetadata.file_name,
            original_name: fileMetadata.original_name,
            url: fileMetadata.signed_url,
            type: fileMetadata.file_type,
            size: fileMetadata.file_size,
            path: fileMetadata.file_path,
            uploaded_by: fileMetadata.uploaded_by,
            uploaded_at: fileMetadata.created_at,
            description: fileMetadata.description,
          },
        ];

        const { error: updateError } = await authContext.supabase
          .from(`${validation.data.entity_type}s`)
          .update({ attachments: updatedAttachments })
          .eq("id", validation.data.entity_id);

        if (updateError) {
          // Clean up uploaded file if database update fails
          await authContext.supabase.storage
            .from("attachments")
            .remove([filePath]);

          errors.push(`File ${file.name}: failed to save metadata`);
          continue;
        }

        uploadResults.push({
          file_name: fileMetadata.file_name,
          original_name: fileMetadata.original_name,
          file_type: fileMetadata.file_type,
          file_size: fileMetadata.file_size,
          file_path: fileMetadata.file_path,
          signed_url: fileMetadata.signed_url,
          uploaded_at: fileMetadata.created_at,
        });

        // Log audit entry
        await logAuditEntry(
          authContext,
          {
            table_name: "file_uploads",
            record_id: validation.data.entity_id,
            action: "INSERT",
            new_values: {
              file_name: fileMetadata.file_name,
              entity_type: validation.data.entity_type,
              entity_id: validation.data.entity_id,
              file_size: fileMetadata.file_size,
              file_path: fileMetadata.file_path,
            },
          },
          request,
        );
      } catch (fileError) {
        console.error(`Error processing file ${file.name}:`, fileError);
        errors.push(`File ${file.name}: processing failed`);
      }
    }

    const response = {
      message: `Successfully uploaded ${uploadResults.length} file(s)`,
      uploaded_files: uploadResults,
      errors: errors.length > 0 ? errors : undefined,
      entity_type: validation.data.entity_type,
      entity_id: validation.data.entity_id,
    };

    return createSuccessResponse(response, 201);
  } catch (error) {
    console.error("File upload error:", error);
    return createErrorResponse("File upload failed");
  }
}

// GET - Retrieve signed URLs for files
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("file_path");
    const entityType = searchParams.get("entity_type");
    const entityId = searchParams.get("entity_id");

    // Validate query parameters
    const validation = fileAccessSchema.safeParse({
      file_path: filePath,
      entity_type: entityType,
      entity_id: entityId,
    });

    if (!validation.success) {
      return createBadRequestResponse(
        validation.error.errors.map((e) => e.message).join(", "),
      );
    }

    // If entity info is provided, check permissions
    if (validation.data.entity_type && validation.data.entity_id) {
      const permissionCheck = await checkEntityPermissions(
        authContext,
        validation.data.entity_type,
        validation.data.entity_id,
        "read",
      );

      if (!permissionCheck.allowed) {
        return createForbiddenResponse(
          "Insufficient permissions to access this file",
        );
      }
    }

    // Generate signed URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } =
      await authContext.supabase.storage
        .from("attachments")
        .createSignedUrl(validation.data.file_path, 3600);

    if (signedUrlError) {
      if (signedUrlError.message.includes("not found")) {
        return createBadRequestResponse("File not found");
      }
      return createErrorResponse("Failed to generate file access URL");
    }

    // Log audit entry for file access
    await logAuditEntry(
      authContext,
      {
        table_name: "file_access",
        record_id: validation.data.entity_id || "unknown",
        action: "UPDATE",
        new_values: {
          file_path: validation.data.file_path,
          accessed_at: new Date().toISOString(),
        },
      },
      request,
    );

    return createSuccessResponse({
      file_path: validation.data.file_path,
      signed_url: signedUrlData.signedUrl,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  } catch (error) {
    console.error("File access error:", error);
    return createErrorResponse("File access failed");
  }
}

// DELETE - Delete files
export async function DELETE(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const body = await request.json();

    // Validate request body
    const validation = fileDeleteSchema.safeParse(body);

    if (!validation.success) {
      return createBadRequestResponse(
        validation.error.errors.map((e) => e.message).join(", "),
      );
    }

    // If entity info is provided, check permissions
    if (validation.data.entity_type && validation.data.entity_id) {
      const permissionCheck = await checkEntityPermissions(
        authContext,
        validation.data.entity_type,
        validation.data.entity_id,
        "write",
      );

      if (!permissionCheck.allowed) {
        return createForbiddenResponse(
          "Insufficient permissions to delete this file",
        );
      }

      // Remove file from entity's attachments
      const currentEntity = await authContext.supabase
        .from(`${validation.data.entity_type}s`)
        .select("attachments")
        .eq("id", validation.data.entity_id)
        .single();

      if (currentEntity.data?.attachments) {
        const updatedAttachments = currentEntity.data.attachments.filter(
          (attachment: any) => attachment.path !== validation.data.file_path,
        );

        await authContext.supabase
          .from(`${validation.data.entity_type}s`)
          .update({ attachments: updatedAttachments })
          .eq("id", validation.data.entity_id);
      }
    }

    // Delete file from storage
    const { error: deleteError } = await authContext.supabase.storage
      .from("attachments")
      .remove([validation.data.file_path]);

    if (deleteError) {
      if (deleteError.message.includes("not found")) {
        return createBadRequestResponse("File not found");
      }
      return createErrorResponse("Failed to delete file");
    }

    // Log audit entry
    await logAuditEntry(
      authContext,
      {
        table_name: "file_deletions",
        record_id: validation.data.entity_id || "unknown",
        action: "DELETE",
        old_values: {
          file_path: validation.data.file_path,
          deleted_at: new Date().toISOString(),
        },
      },
      request,
    );

    return createSuccessResponse({
      message: "File deleted successfully",
      file_path: validation.data.file_path,
    });
  } catch (error) {
    console.error("File deletion error:", error);
    return createErrorResponse("File deletion failed");
  }
}
