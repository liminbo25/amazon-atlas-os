import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import {
  IMAGE_BLOB_ALLOWED_CONTENT_TYPES,
  IMAGE_BLOB_MAX_BYTES,
} from "@/lib/image-blob";

export const runtime = "nodejs";

const IMAGE_STUDIO_UPLOAD_PREFIX = "image-studio/";
const IMAGE_FILENAME_PATTERN = /\.[a-z0-9]+$/i;

function isAllowedPathname(pathname: string) {
  return (
    pathname.startsWith(IMAGE_STUDIO_UPLOAD_PREFIX) &&
    IMAGE_FILENAME_PATTERN.test(pathname)
  );
}

export async function POST(request: NextRequest) {
  let body: HandleUploadBody;

  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid upload payload." },
      { status: 400 }
    );
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isAllowedPathname(pathname)) {
          throw new Error("Upload path is not allowed.");
        }

        return {
          addRandomSuffix: false,
          allowedContentTypes: IMAGE_BLOB_ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: IMAGE_BLOB_MAX_BYTES,
        };
      },
    });

    return NextResponse.json(json);
  } catch (error) {
    console.error("Blob upload route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare image upload.",
      },
      { status: 500 }
    );
  }
}
