"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import type { ProductImage, ImageCategory } from "@/lib/types";

interface ProductImageUploadProps {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
  maxImages?: number;
  maxSizeMB?: number;
}

type UploadNotice = {
  tone: "success" | "warning" | "info";
  message: string;
};

const CATEGORY_LABELS: Record<ImageCategory, string> = {
  front: "正面",
  left: "左侧",
  right: "右侧",
  back: "背面",
  detail: "细节",
};

export function ProductImageUpload({
  images,
  onChange,
  maxImages = 10,
  maxSizeMB = 5,
}: ProductImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notice, setNotice] = useState<UploadNotice | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const remainingSlots = Math.max(0, maxImages - images.length);

  const compressImage = async (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        const img = new window.Image();

        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxSize = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height && width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("无法初始化图片处理画布"));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };

        img.onerror = () => reject(new Error("图片解码失败"));
        img.src = typeof event.target?.result === "string" ? event.target.result : "";
      };

      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(file);
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || isProcessing) {
      return;
    }

    if (remainingSlots === 0) {
      setNotice({
        tone: "info",
        message: `已达到 ${maxImages} 张上限，请先删除图片后再继续上传。`,
      });
      return;
    }

    setIsProcessing(true);
    setNotice(null);

    const selectedFiles = Array.from(files);
    const filesToProcess = selectedFiles.slice(0, remainingSlots);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const newImages: ProductImage[] = [];
    const messages: string[] = [];
    const warnings: string[] = [];
    let compressedCount = 0;

    if (selectedFiles.length > filesToProcess.length) {
      warnings.push(`最多还能上传 ${remainingSlots} 张，已自动忽略多余文件。`);
    }

    for (const [index, file] of filesToProcess.entries()) {
      if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/)) {
        warnings.push(`已跳过 ${file.name}，仅支持 JPG、PNG、WEBP。`);
        continue;
      }

      if (file.size > maxSizeBytes) {
        compressedCount += 1;
      }

      try {
        const preview = await compressImage(file);
        newImages.push({
          id: `${Date.now()}-${index}`,
          preview,
          category: "detail",
          label: file.name,
        });
      } catch (error) {
        console.error("图片处理失败:", error);
        warnings.push(`处理 ${file.name} 时失败，请重试。`);
      }
    }

    if (newImages.length > 0) {
      onChange([...images, ...newImages]);
      messages.push(`已添加 ${newImages.length} 张图片。`);
    }

    if (compressedCount > 0) {
      messages.push(`${compressedCount} 张图片已自动压缩。`);
    }

    if (warnings.length > 0) {
      setNotice({
        tone: newImages.length > 0 ? "info" : "warning",
        message: [...messages, ...warnings].join(" "),
      });
    } else if (messages.length > 0) {
      setNotice({
        tone: "success",
        message: messages.join(" "),
      });
    }

    setIsProcessing(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!isProcessing && remainingSlots > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleClick = () => {
    if (!isProcessing && remainingSlots > 0) {
      fileInputRef.current?.click();
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(event.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = (id: string) => {
    onChange(images.filter((image) => image.id !== id));
    setNotice(null);
  };

  const updateCategory = (id: string, category: ImageCategory) => {
    onChange(
      images.map((image) =>
        image.id === id ? { ...image, category } : image
      )
    );
  };

  const noticeClassName =
    notice?.tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : notice?.tone === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Label>产品图片（可选）</Label>
        <Badge variant="outline">剩余 {remainingSlots} / {maxImages} 张</Badge>
      </div>

      {notice && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${noticeClassName}`}>
          {notice.message}
        </div>
      )}

      {remainingSlots > 0 ? (
        <button
          type="button"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
          disabled={isProcessing || remainingSlots === 0}
          className={[
            "block w-full",
            "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            isProcessing || remainingSlots === 0
              ? "cursor-not-allowed opacity-70"
              : "cursor-pointer",
            isDragging
              ? "border-[#FF9900] bg-orange-50"
              : "border-muted hover:border-[#FF9900] hover:bg-muted/50",
          ].join(" ")}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            multiple
            onChange={handleFileInput}
            className="hidden"
          />

          {isProcessing ? (
            <>
              <Loader2 className="mx-auto mb-3 h-12 w-12 animate-spin text-[#FF9900]" />
              <p className="mb-1 text-sm font-medium">正在处理图片...</p>
              <p className="text-xs text-muted-foreground">
                上传完成后会自动压缩并生成预览。
              </p>
            </>
          ) : (
            <>
              <Upload className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
              <p className="mb-1 text-sm font-medium">点击上传或拖拽图片到此处</p>
              <p className="text-xs text-muted-foreground">
                支持 JPG/PNG/WEBP，单张最大 {maxSizeMB}MB
              </p>
            </>
          )}
        </button>
      ) : (
        <div className="rounded-lg border border-dashed border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-700">
          图片数量已达到上限。删除部分图片后，可继续上传补充视角。
        </div>
      )}

      {images.length === 0 && (
        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <ImageIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">建议至少上传 1 张主图</p>
              <p>图片越完整，后续 AI 越容易提取外观、材质和卖点线索。</p>
            </div>
          </div>
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <Card key={image.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative aspect-square bg-muted/20">
                  <Image
                    src={image.preview}
                    alt={image.label}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                    className="object-cover"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    aria-label={`删除图片 ${image.label}`}
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeImage(image.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  <Badge className="absolute bottom-2 left-2 text-xs">
                    {CATEGORY_LABELS[image.category]}
                  </Badge>
                </div>

                <div className="space-y-2 p-2">
                  <p className="truncate text-xs text-muted-foreground" title={image.label}>
                    {image.label}
                  </p>
                  <Select
                    value={image.category}
                    onValueChange={(value) => {
                      if (value) {
                        updateCategory(image.id, value as ImageCategory);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="选择图片视角" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <p className="text-xs text-muted-foreground">
          已上传 {images.length} / {maxImages} 张图片，可继续为不同视角分类，方便后续分析。
        </p>
      )}
    </div>
  );
}
