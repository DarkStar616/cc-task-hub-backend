import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  createUnauthorizedResponse,
  createBadRequestResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/auth";
import { logSensitiveAction, SENSITIVE_ACTIONS } from "@/utils/audit-log";

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);

    if (!authContext.user) {
      return createUnauthorizedResponse();
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const sopId = formData.get("sop_id") as string;
    const department = formData.get("department") as string;

    if (!file) {
      return createBadRequestResponse("No file provided");
    }

    // Validate file type and size
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/gif"
    ];

    if (!allowedTypes.includes(file.type)) {
      return createBadRequestResponse("File type not allowed");
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return createBadRequestResponse("File size exceeds 10MB limit");
    }

    // Upload to Supabase Storage
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `sops/${fileName}`;

    const { data: uploadData, error: uploadError } = await authContext.supabase.storage
      .from("documents")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("File upload error:", uploadError);
      return createErrorResponse("Failed to upload file");
    }

    // Get public URL
    const { data: { publicUrl } } = authContext.supabase.storage
      .from("documents")
      .getPublicUrl(filePath);

    // Log file upload
    await logSensitiveAction(
      authContext,
      SENSITIVE_ACTIONS.FILE_UPLOAD,
      {
        tableName: "file_uploads",
        recordId: uploadData.id || fileName,
        newValues: {
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          sop_id: sopId,
          department,
        },
        metadata: {
          action: "file_upload",
          original_name: file.name,
        },
      },
      request,
    );

    return createSuccessResponse(
      {
        file_name: file.name,
        file_path: filePath,
        file_url: publicUrl,
        file_size: file.size,
        file_type: file.type,
        uploaded_at: new Date().toISOString(),
      },
      201,
      "File uploaded successfully"
    );

  } catch (error) {
    console.error("File upload error:", error);
    return createErrorResponse("Internal server error");
  }
}