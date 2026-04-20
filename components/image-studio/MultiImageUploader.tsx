"use client";

/* eslint-disable @next/next/no-img-element */

import { upload } from "@vercel/blob/client";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

interface MultiImageUploaderProps {
  onImagesChange: (images: string[]) => void;
  images: string[];
  title?: string;
  description?: string;
  maxImages?: number;
  uploadFolder?: string;
  renderImageFooter?: (options: { image: string; index: number }) => ReactNode;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function sanitizeFilename(filename: string) {
  const trimmed = filename.trim().toLowerCase();
  const replaced = trimmed.replace(/[^a-z0-9._-]+/g, "-");
  return replaced.replace(/-+/g, "-").replace(/^-|-$/g, "") || "image";
}

function buildUploadPath(folder: string, fileName: string) {
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, "") || "misc";
  return `image-studio/${normalizedFolder}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFilename(
    fileName
  )}`;
}

function normalizeUploadError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "图片上传失败，请稍后重试。";
}

export default function MultiImageUploader({
  onImagesChange,
  images,
  title = "上传图片",
  description,
  maxImages,
  uploadFolder = "misc",
  renderImageFooter,
}: MultiImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openFilePicker = useCallback(() => {
    if (isUploading) {
      return;
    }

    inputRef.current?.click();
  }, [isUploading]);

  const handleFiles = useCallback(
    async (files: FileList) => {
      const selectedFiles = Array.from(files);
      const validFiles = selectedFiles.filter((file) => ALLOWED_IMAGE_TYPES.has(file.type));

      if (validFiles.length === 0) {
        setUploadError("请选择 JPG、PNG 或 WebP 图片。");
        return;
      }

      const remainingSlots =
        maxImages === undefined ? validFiles.length : Math.max(maxImages - images.length, 0);
      const filesToUpload =
        maxImages === 1
          ? [validFiles.at(-1)!]
          : maxImages
            ? validFiles.slice(0, remainingSlots)
            : validFiles;

      if (filesToUpload.length === 0) {
        setUploadError("当前上传位已满，请先删除一张再继续上传。");
        return;
      }

      const oversizedFile = filesToUpload.find((file) => file.size > MAX_UPLOAD_BYTES);

      if (oversizedFile) {
        setUploadError(
          `${oversizedFile.name} 超过 ${formatBytes(
            MAX_UPLOAD_BYTES
          )}，请先裁切或导出更小的版本。`
        );
        return;
      }

      setIsUploading(true);
      setUploadError(null);

      try {
        const uploadedUrls: string[] = [];

        for (const [index, file] of filesToUpload.entries()) {
          const pathname = buildUploadPath(uploadFolder, file.name);
          setUploadProgressLabel(
            `上传中 ${index + 1}/${filesToUpload.length} · ${file.name}`
          );

          const blob = await upload(pathname, file, {
            access: "public",
            contentType: file.type || undefined,
            handleUploadUrl: "/api/blob/upload",
            multipart: file.size > MULTIPART_THRESHOLD_BYTES,
            onUploadProgress: ({ percentage }) => {
              setUploadProgressLabel(
                `上传中 ${index + 1}/${filesToUpload.length} · ${file.name} · ${Math.round(
                  percentage
                )}%`
              );
            },
          });

          uploadedUrls.push(blob.url);
        }

        let nextImages: string[];

        if (maxImages === 1) {
          nextImages = [uploadedUrls.at(-1)!];
        } else if (maxImages) {
          nextImages = [...images, ...uploadedUrls].slice(0, maxImages);
        } else {
          nextImages = [...images, ...uploadedUrls];
        }

        onImagesChange(nextImages);
      } catch (error) {
        setUploadError(normalizeUploadError(error));
      } finally {
        setIsUploading(false);
        setUploadProgressLabel(null);
      }
    },
    [images, maxImages, onImagesChange, uploadFolder]
  );

  useEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    const handleNativeChange = () => {
      if (input.files && input.files.length > 0) {
        void handleFiles(input.files);
      }

      input.value = "";
    };

    input.addEventListener("change", handleNativeChange);

    return () => {
      input.removeEventListener("change", handleNativeChange);
    };
  }, [handleFiles]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);

      if (event.dataTransfer.files.length > 0) {
        void handleFiles(event.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const removeImage = useCallback(
    (index: number) => {
      onImagesChange(images.filter((_, currentIndex) => currentIndex !== index));
    },
    [images, onImagesChange]
  );

  return (
    <div className="w-full">
      {(title || description) && (
        <div className="mb-4 space-y-1">
          {title ? (
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-400">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="max-w-xl text-sm leading-6 text-stone-300/80">{description}</p>
          ) : null}
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-disabled={isUploading}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFilePicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFilePicker();
          }
        }}
        className={`obsidian-card group relative flex min-h-56 w-full flex-col items-center justify-center overflow-hidden border border-dashed px-6 py-8 text-center transition ${
          isDragging
            ? "border-[rgba(196,138,86,0.75)] bg-[rgba(196,138,86,0.12)] shadow-[0_18px_42px_rgba(180,83,9,0.18)]"
            : "hover:border-[rgba(196,138,86,0.35)]"
        } ${isUploading ? "cursor-progress" : "cursor-pointer"}`}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple={maxImages !== 1}
          className="hidden"
        />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(196,138,86,0.15),_transparent_55%)] opacity-0 transition group-hover:opacity-100" />

        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(196,138,86,0.25)] bg-black/30 text-[#f3e8d2]">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.7}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-1.5-1.5 1.086-1.086a2 2 0 012.828 0L20 14.5M14 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>

        <p className="relative mt-5 text-lg font-semibold text-[#f3e8d2]">
          {isUploading ? "正在上传原图..." : "拖拽图片到这里，或点击选择"}
        </p>
        <p className="relative mt-2 max-w-md text-sm leading-6 text-stone-300/75">
          支持 JPG、PNG、WebP。现在会直接上传原图到 Vercel Blob，不再做前端压缩。
          {maxImages ? ` 最多上传 ${maxImages} 张。` : " 可继续追加多张图片。"}
        </p>

        <div className="obsidian-meta-pill relative mt-6 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-200/80">
          <span className="h-2 w-2 rounded-full bg-[rgba(196,138,86,0.95)]" />
          已选择 {images.length} 张
        </div>
      </div>

      {uploadProgressLabel ? (
        <p className="obsidian-inline-note mt-3 border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          {uploadProgressLabel}
        </p>
      ) : null}

      {uploadError ? (
        <p className="obsidian-inline-note mt-3 border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {uploadError}
        </p>
      ) : null}

        <p className="obsidian-inline-note mt-3 px-4 py-3 text-sm leading-6 text-stone-300/80">
        单张上限约 {formatBytes(MAX_UPLOAD_BYTES)}。如果上传特别慢，优先裁掉无关背景，而不是先压缩面料细节。
      </p>

      {images.length > 0 ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((image, index) => (
            <div
              key={`${image.slice(0, 48)}-${index}`}
              className="obsidian-soft-card group overflow-hidden"
            >
              <div className="relative aspect-[4/5] bg-black/20">
                <img src={image} alt={`${title} ${index + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeImage(index);
                  }}
                  className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white opacity-0 transition group-hover:opacity-100"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="space-y-3 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#f7f0e6]">图片 {index + 1}</span>
                  {maxImages ? (
                    <span className="obsidian-meta-pill px-2.5 py-1 text-xs font-semibold text-stone-200/80">
                      {index + 1}/{maxImages}
                    </span>
                  ) : null}
                </div>

                <div className="obsidian-inline-note px-3 py-2 text-xs leading-6 text-stone-300/80">
                  原图已上传到 Blob，可直接用于 URL 版换装链路。
                </div>
              </div>

              {renderImageFooter ? (
                <div className="border-t border-white/10 px-4 py-4">
                  {renderImageFooter({ image, index })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
