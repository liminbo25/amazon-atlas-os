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

const TARGET_DATA_URL_LENGTH = 900_000;
const IMAGE_COMPRESSION_STEPS = [
  { maxEdge: 1600, quality: 0.88 },
  { maxEdge: 1400, quality: 0.82 },
  { maxEdge: 1200, quality: 0.76 },
  { maxEdge: 1000, quality: 0.7 },
  { maxEdge: 900, quality: 0.64 },
];

function renderCompressedImage(
  image: HTMLImageElement,
  maxEdge: number,
  quality: number
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
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
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
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const convertToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();

        image.onload = () => {
          try {
            let compressed = renderCompressedImage(
              image,
              IMAGE_COMPRESSION_STEPS[0].maxEdge,
              IMAGE_COMPRESSION_STEPS[0].quality
            );

            for (const step of IMAGE_COMPRESSION_STEPS.slice(1)) {
              if (compressed.length <= TARGET_DATA_URL_LENGTH) {
                break;
              }

              compressed = renderCompressedImage(image, step.maxEdge, step.quality);
            }

            resolve(compressed);
          } catch (error) {
            reject(error);
          }
        };

        image.onerror = reject;
        image.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

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
        const newImages: string[] = [];

        for (const file of validFiles) {
          const base64 = await convertToBase64(file);
          newImages.push(base64);
        }

        if (maxImages === 1) {
          onImagesChange([newImages.at(-1)!]);
          return;
        }

        if (maxImages) {
          onImagesChange([...images, ...newImages].slice(0, maxImages));
          return;
        }

        onImagesChange([...images, ...newImages]);
      } catch {
        setUploadError("所选图片无法完成压缩处理，请换一张图片重试。");
      } finally {
        setIsReading(false);
      }
    },
    [convertToBase64, images, maxImages, onImagesChange]
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
          {isReading ? "正在优化图片..." : "拖拽图片到这里，或点击选择"}
        </p>
        <p className="relative mt-2 max-w-md text-sm leading-6 text-slate-500">
          支持 JPG、PNG、WebP。
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

      {images.length > 0 ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((image, index) => (
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
              </div>

              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-medium text-slate-700">图片 {index + 1}</span>
                {maxImages ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                    {index + 1}/{maxImages}
                  </span>
                ) : null}
              </div>

              {renderImageFooter ? (
                <div className="border-t border-slate-200 px-4 py-4">
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
