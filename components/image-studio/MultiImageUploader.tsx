"use client";

/* eslint-disable @next/next/no-img-element */

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

interface MultiImageUploaderProps {
  onImagesChange: (images: string[]) => void;
  images: string[];
  title?: string;
  description?: string;
  maxImages?: number;
  renderImageFooter?: (options: { image: string; index: number }) => ReactNode;
}

interface UploadImageMeta {
  wasCompressed: boolean;
  originalBytes: number;
  finalBytes: number;
  originalMimeType: string;
  finalMimeType: string;
}

interface ProcessedUpload {
  dataUrl: string;
  meta: UploadImageMeta;
}

const TARGET_DATA_URL_LENGTH = 1_600_000;
const IMAGE_COMPRESSION_STEPS = [
  { maxEdge: 2400, quality: 0.96 },
  { maxEdge: 2200, quality: 0.94 },
  { maxEdge: 2000, quality: 0.92 },
  { maxEdge: 1800, quality: 0.9 },
  { maxEdge: 1600, quality: 0.88 },
  { maxEdge: 1400, quality: 0.85 },
];

function clampToByteEstimate(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.round((base64.length * 3) / 4) - padding);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getPreferredCompressionType(fileType: string) {
  if (
    fileType === "image/jpeg" ||
    fileType === "image/png" ||
    fileType === "image/webp"
  ) {
    return fileType;
  }

  return "image/jpeg";
}

function getMimeTypeFromDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)[;,]/);
  return match?.[1] ?? "image/jpeg";
}

function renderCompressedImage(
  image: HTMLImageElement,
  maxEdge: number,
  quality: number,
  mimeType: string
) {
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available.");
  }

  canvas.width = width;
  canvas.height = height;

  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  } else {
    context.clearRect(0, 0, width, height);
  }

  context.drawImage(image, 0, 0, width, height);

  if (mimeType === "image/png") {
    return canvas.toDataURL(mimeType);
  }

  return canvas.toDataURL(mimeType, quality);
}

export default function MultiImageUploader({
  onImagesChange,
  images,
  title = "上传图片",
  description,
  maxImages,
  renderImageFooter,
}: MultiImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageMetaMap, setImageMetaMap] = useState<Record<string, UploadImageMeta>>({});
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const convertToBase64 = useCallback((file: File): Promise<ProcessedUpload> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const originalDataUrl = reader.result;

        if (typeof originalDataUrl !== "string") {
          reject(new Error("Could not read the selected image."));
          return;
        }

        const originalMimeType = file.type || getMimeTypeFromDataUrl(originalDataUrl);

        if (originalDataUrl.length <= TARGET_DATA_URL_LENGTH) {
          resolve({
            dataUrl: originalDataUrl,
            meta: {
              wasCompressed: false,
              originalBytes: file.size,
              finalBytes: file.size,
              originalMimeType,
              finalMimeType: originalMimeType,
            },
          });
          return;
        }

        const image = new Image();

        image.onload = () => {
          try {
            const preferredCompressionType = getPreferredCompressionType(originalMimeType);
            let compressedDataUrl = originalDataUrl;

            for (const step of IMAGE_COMPRESSION_STEPS) {
              compressedDataUrl = renderCompressedImage(
                image,
                step.maxEdge,
                step.quality,
                preferredCompressionType
              );

              if (compressedDataUrl.length <= TARGET_DATA_URL_LENGTH) {
                break;
              }
            }

            resolve({
              dataUrl: compressedDataUrl,
              meta: {
                wasCompressed: true,
                originalBytes: file.size,
                finalBytes: clampToByteEstimate(compressedDataUrl),
                originalMimeType,
                finalMimeType: getMimeTypeFromDataUrl(compressedDataUrl),
              },
            });
          } catch (error) {
            reject(error);
          }
        };

        image.onerror = reject;
        image.src = originalDataUrl;
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const syncImageMeta = useCallback(
    (nextImages: string[], uploads?: ProcessedUpload[]) => {
      setImageMetaMap((current) => {
        const merged = { ...current };

        uploads?.forEach((upload) => {
          merged[upload.dataUrl] = upload.meta;
        });

        return Object.fromEntries(
          nextImages
            .filter((image) => Boolean(image))
            .map((image) => [image, merged[image]])
        ) as Record<string, UploadImageMeta>;
      });
    },
    []
  );

  const handleFiles = useCallback(
    async (files: FileList) => {
      const validFiles = Array.from(files).filter((file) =>
        file.type.startsWith("image/")
      );

      if (validFiles.length === 0) {
        setUploadError("请选择 JPG、PNG 或 WebP 图片。");
        return;
      }

      setIsReading(true);
      setUploadError(null);

      try {
        const uploads: ProcessedUpload[] = [];

        for (const file of validFiles) {
          const processedUpload = await convertToBase64(file);
          uploads.push(processedUpload);
        }

        const newImages = uploads.map((upload) => upload.dataUrl);
        let nextImages: string[];

        if (maxImages === 1) {
          nextImages = [newImages.at(-1)!];
        } else if (maxImages) {
          nextImages = [...images, ...newImages].slice(0, maxImages);
        } else {
          nextImages = [...images, ...newImages];
        }

        syncImageMeta(nextImages, uploads);
        onImagesChange(nextImages);
      } catch {
        setUploadError("所选图片无法完成处理，请换一张图片重试。");
      } finally {
        setIsReading(false);
      }
    },
    [convertToBase64, images, maxImages, onImagesChange, syncImageMeta]
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

  useEffect(() => {
    syncImageMeta(images);
  }, [images, syncImageMeta]);

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
      const nextImages = images.filter((_, currentIndex) => currentIndex !== index);
      syncImageMeta(nextImages);
      onImagesChange(nextImages);
    },
    [images, onImagesChange, syncImageMeta]
  );

  const compressedCount = images.filter(
    (image) => imageMetaMap[image]?.wasCompressed
  ).length;

  return (
    <div className="w-full">
      {(title || description) && (
        <div className="mb-4 space-y-1">
          {title ? (
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              {description}
            </p>
          ) : null}
        </div>
      )}

      <label
        htmlFor={inputId}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group relative flex min-h-56 w-full flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border border-dashed px-6 py-8 text-center transition ${
          isDragging
            ? "border-amber-500 bg-amber-50 shadow-[0_18px_42px_rgba(180,83,9,0.18)]"
            : "border-slate-300/70 bg-white/80 hover:border-slate-500 hover:bg-white"
        }`}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={maxImages !== 1}
          className="hidden"
        />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.15),_transparent_55%)] opacity-0 transition group-hover:opacity-100" />

        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-slate-950 text-white">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.7}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-1.5-1.5 1.086-1.086a2 2 0 012.828 0L20 14.5M14 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>

        <p className="relative mt-5 text-lg font-semibold text-slate-950">
          {isReading ? "正在检查图片..." : "拖拽图片到这里，或点击选择"}
        </p>
        <p className="relative mt-2 max-w-md text-sm leading-6 text-slate-500">
          支持 JPG、PNG、WebP。默认优先保留原图，仅在图片过大时才做前端压缩。
          {" "}
          {maxImages ? `最多上传 ${maxImages} 张。` : "可按需继续添加。"}
        </p>

        <div className="relative mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          已选择 {images.length} 张
        </div>
      </label>

      {uploadError ? (
        <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {uploadError}
        </p>
      ) : null}

      {compressedCount > 0 ? (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          当前有 {compressedCount} 张图片因体积过大已做前端压缩，卡片上会显示“已压缩”标记。
        </p>
      ) : null}

      {images.length > 0 ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((image, index) => {
            const imageMeta = imageMetaMap[image];

            return (
              <div
                key={`${image.slice(0, 32)}-${index}`}
                className="group overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
              >
                <div className="relative aspect-[4/5] bg-slate-100">
                  <img
                    src={image}
                    alt={`${title} ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeImage(index);
                    }}
                    className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/80 text-white opacity-0 transition group-hover:opacity-100"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18 18 6M6 6l12 12"
                      />
                    </svg>
                  </button>

                  {imageMeta?.wasCompressed ? (
                    <div className="absolute left-3 top-3 rounded-full bg-amber-300 px-3 py-1 text-[11px] font-semibold text-slate-950 shadow-sm">
                      已压缩
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">图片 {index + 1}</span>
                    {maxImages ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        {index + 1}/{maxImages}
                      </span>
                    ) : null}
                  </div>

                  {imageMeta?.wasCompressed ? (
                    <div
                      className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800"
                      title={`原图约 ${formatBytes(imageMeta.originalBytes)}，当前约 ${formatBytes(imageMeta.finalBytes)}`}
                    >
                      已压缩：{formatBytes(imageMeta.originalBytes)} →{" "}
                      {formatBytes(imageMeta.finalBytes)}
                    </div>
                  ) : null}
                </div>

                {renderImageFooter ? (
                  <div className="border-t border-slate-200 px-4 py-4">
                    {renderImageFooter({ image, index })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
