"use client";

import Image from "next/image";
import { useState } from "react";
import { ProductImageUpload } from "@/components/ProductImageUpload";
import {
  AiRequestErrorAlert,
  ApiRequestError,
  normalizeApiRequestError,
  parseApiRequestError,
} from "@/components/AiRequestErrorAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useListingStore } from "@/lib/store";
import type {
  AbaReportFile,
  AiRuntimeRequestConfig,
  ProductImage,
  ProductProfile,
  RufusScreenshot,
  ScreenshotMediaType,
  VisionAnalysisResult,
} from "@/lib/types";
import {
  ArrowRight,
  Eye,
  FileSpreadsheet,
  Lightbulb,
  Loader2,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  Wrench,
  X,
} from "lucide-react";

const ASIN_PATTERN = /^[A-Z0-9]{10}$/;
const MAX_CORE_KEYWORDS = 3;
const MAX_RUFUS_IMAGES = 4;

const marketOptions = [
  { value: "US", label: "美国 (US)" },
  { value: "UK", label: "英国 (UK)" },
  { value: "DE", label: "德国 (DE)" },
  { value: "FR", label: "法国 (FR)" },
  { value: "IT", label: "意大利 (IT)" },
  { value: "ES", label: "西班牙 (ES)" },
  { value: "JP", label: "日本 (JP)" },
  { value: "CA", label: "加拿大 (CA)" },
];

const categoryOptions = [
  "Beauty & Personal Care",
  "Health & Household",
  "Home & Kitchen",
  "Kitchen & Dining",
  "Sports & Outdoors",
  "Pet Supplies",
  "Baby",
  "Electronics",
  "Office Products",
  "Automotive",
  "Other",
];

function splitCommaValues(value: string): string[] {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCsvPreview(content: string): Pick<AbaReportFile, "headers" | "rows"> {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const parseLine = (line: string) =>
    line
      .split(",")
      .map((cell) => cell.replace(/^"|"$/g, "").trim())
      .slice(0, 6);

  return {
    headers: parseLine(lines[0]),
    rows: lines.slice(1).map(parseLine).filter((row) => row.length > 0),
  };
}

function dataUrlToMediaType(dataUrl: string): ScreenshotMediaType {
  if (dataUrl.startsWith("data:image/png")) {
    return "image/png";
  }

  if (dataUrl.startsWith("data:image/webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

export function Step1Analysis() {
  const {
    productProfile,
    targetMarket,
    competitorAsins,
    coreSellingPoints,
    productImages,
    visionAnalysis,
    supportAssets,
    aiRuntimeSettings,
    updateProductProfile,
    setTargetMarket,
    setCompetitorAsins,
    setCoreSellingPoints,
    setProductImages,
    setVisionAnalysis,
    setSupportAssets,
    setDataAnalysis,
    setCompetitorListings,
    setCompetitorReviews,
    setPositiveReviews,
    setTrafficKeywords,
    setPainPoints,
    setValuePoints,
    setCompetitorAnalysis,
    setListingVersions,
    setComplianceResults,
    setCurrentStep,
  } = useListingStore();

  const [localProfile, setLocalProfile] = useState<ProductProfile>(productProfile);
  const [localTargetMarket, setLocalTargetMarket] = useState(targetMarket);
  const [localCompetitorAsins, setLocalCompetitorAsins] = useState(
    competitorAsins.filter(Boolean).join(", ")
  );
  const [localCoreSellingPoints, setLocalCoreSellingPoints] = useState(
    coreSellingPoints
  );
  const [localProductImages, setLocalProductImages] = useState<ProductImage[]>(
    productImages
  );
  const [localVisionAnalysis, setLocalVisionAnalysis] =
    useState<VisionAnalysisResult | null>(visionAnalysis);
  const [localAbaReport, setLocalAbaReport] = useState<AbaReportFile | null>(
    supportAssets.abaReport
  );
  const [localRufusScreenshots, setLocalRufusScreenshots] = useState<
    RufusScreenshot[]
  >(supportAssets.rufusScreenshots);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<ApiRequestError | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [abaError, setAbaError] = useState<string | null>(null);
  const [rufusError, setRufusError] = useState<string | null>(null);
  const [abaUploading, setAbaUploading] = useState(false);
  const [rufusUploading, setRufusUploading] = useState(false);

  const imageRuntime: AiRuntimeRequestConfig = {
    task: "imageAnalysis",
    ...aiRuntimeSettings.imageAnalysis,
  };

  const clearStep4Output = () => {
    setListingVersions([]);
    setComplianceResults({});
  };

  const clearMultiSourceData = () => {
    setDataAnalysis(null);
    clearStep4Output();
  };

  const clearStep2To4Data = () => {
    setCompetitorListings([]);
    setCompetitorReviews({});
    setPositiveReviews({});
    setTrafficKeywords({});
    setDataAnalysis(null);
    setPainPoints([]);
    setValuePoints([]);
    setCompetitorAnalysis([]);
    clearStep4Output();
  };

  const updateProfileField = (field: keyof ProductProfile, value: string) => {
    setLocalProfile((current) => ({ ...current, [field]: value }));
    setFormError(null);
  };

  const handleProductImagesChange = (images: ProductImage[]) => {
    setLocalProductImages(images);
    setLocalVisionAnalysis(null);
    setAnalysisError(null);
  };

  const handleAnalyzeImages = async () => {
    if (analyzing) {
      return;
    }

    if (localProductImages.length === 0) {
      setAnalysisError(
        new ApiRequestError("请先上传至少 1 张产品图片，再进行 AI 图片分析。", {
          status: 400,
        })
      );
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const images = localProductImages.map((image) => {
        const match = image.preview.match(/^data:(.+?);base64,(.+)$/);

        return {
          data: match ? match[2] : image.preview,
          mediaType: match ? match[1] : "image/jpeg",
        };
      });

      const response = await fetch("/api/analyze-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          runtime: imageRuntime,
          runtimeConfig: aiRuntimeSettings,
        }),
      });

      if (!response.ok) {
        throw await parseApiRequestError(response, "图片分析失败");
      }

      const data = (await response.json()) as VisionAnalysisResult;
      setLocalVisionAnalysis(data);
    } catch (error) {
      setAnalysisError(normalizeApiRequestError(error, "图片分析失败"));
    } finally {
      setAnalyzing(false);
    }
  };

  const fillSellingPoints = () => {
    if (!localVisionAnalysis) {
      return;
    }

    const existingLines = localCoreSellingPoints
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const merged = [...existingLines];
    for (const point of localVisionAnalysis.sellingPoints) {
      if (
        point &&
        !merged.some((existing) => existing.toLowerCase() === point.toLowerCase())
      ) {
        merged.push(point);
      }
    }

    setLocalCoreSellingPoints(merged.join("\n"));
    setFormError(null);
  };

  const handleAbaFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setAbaError("ABA 报告请上传 CSV 文件。");
      return;
    }

    setAbaUploading(true);
    setAbaError(null);

    try {
      const content = await file.text();
      const preview = parseCsvPreview(content);
      setLocalAbaReport({
        fileName: file.name,
        size: file.size,
        content,
        headers: preview.headers,
        rows: preview.rows,
      });
    } catch {
      setAbaError("ABA 报告读取失败，请重新上传。");
    } finally {
      setAbaUploading(false);
    }
  };

  const handleRufusFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    if (localRufusScreenshots.length >= MAX_RUFUS_IMAGES) {
      setRufusError(`Rufus 截图最多保留 ${MAX_RUFUS_IMAGES} 张。`);
      return;
    }

    const acceptedFiles = files.slice(
      0,
      MAX_RUFUS_IMAGES - localRufusScreenshots.length
    );

    setRufusUploading(true);
    setRufusError(null);

    try {
      const screenshots = await Promise.all(
        acceptedFiles.map(
          (file, index) =>
            new Promise<RufusScreenshot>((resolve, reject) => {
              if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/)) {
                reject(new Error("unsupported"));
                return;
              }

              const reader = new FileReader();
              reader.onload = () => {
                const preview =
                  typeof reader.result === "string" ? reader.result : "";

                if (!preview.startsWith("data:image/")) {
                  reject(new Error("invalid"));
                  return;
                }

                resolve({
                  id: `${Date.now()}-${index}-${file.name}`,
                  name: file.name,
                  preview,
                  mediaType: dataUrlToMediaType(preview),
                });
              };
              reader.onerror = () => reject(new Error("read_failed"));
              reader.readAsDataURL(file);
            })
        )
      );

      setLocalRufusScreenshots((current) => [...current, ...screenshots]);
    } catch {
      setRufusError("Rufus 截图上传失败，请使用 JPG / PNG / WEBP 图片。");
    } finally {
      setRufusUploading(false);
    }
  };

  const handleNext = () => {
    const keywords = splitCommaValues(localProfile.coreKeywords);
    const validAsins = splitCommaValues(localCompetitorAsins)
      .map((asin) => asin.toUpperCase())
      .filter(Boolean);
    const invalidAsins = validAsins.filter((asin) => !ASIN_PATTERN.test(asin));

    if (!localProfile.productName.trim()) {
      setFormError("请填写产品名称。");
      return;
    }

    if (!localProfile.productCategory.trim()) {
      setFormError("请选择产品品类。");
      return;
    }

    if (!localProfile.productDescription.trim()) {
      setFormError("请填写产品描述。");
      return;
    }

    if (keywords.length > MAX_CORE_KEYWORDS) {
      setFormError(`核心关键词最多填写 ${MAX_CORE_KEYWORDS} 个。`);
      return;
    }

    if (validAsins.length === 0) {
      setFormError("请至少填写 1 个竞品 ASIN。");
      return;
    }

    if (validAsins.length > 3) {
      setFormError("竞品 ASIN 最多填写 3 个。");
      return;
    }

    if (invalidAsins.length > 0) {
      setFormError(
        `以下 ASIN 格式不正确：${invalidAsins.join("、")}。ASIN 需要是 10 位字母或数字。`
      );
      return;
    }

    const normalizedProfile: ProductProfile = {
      ...localProfile,
      brandName: localProfile.brandName.trim(),
      productName: localProfile.productName.trim(),
      productCategory: localProfile.productCategory.trim(),
      productDescription: localProfile.productDescription.trim(),
      coreKeywords: keywords.join(", "),
    };

    const asinsChanged =
      localTargetMarket !== targetMarket ||
      validAsins.join("|") !== competitorAsins.filter(Boolean).join("|");
    const profileChanged =
      JSON.stringify(normalizedProfile) !== JSON.stringify(productProfile);
    const supportChanged =
      (localAbaReport?.content ?? "") !== (supportAssets.abaReport?.content ?? "") ||
      (localAbaReport?.fileName ?? "") !== (supportAssets.abaReport?.fileName ?? "") ||
      localRufusScreenshots.map((item) => item.name).join("|") !==
        supportAssets.rufusScreenshots.map((item) => item.name).join("|");
    const sellingPointsChanged =
      localCoreSellingPoints.trim() !== coreSellingPoints.trim();

    if (asinsChanged) {
      clearStep2To4Data();
    } else if (profileChanged || supportChanged) {
      clearMultiSourceData();
    } else if (sellingPointsChanged) {
      clearStep4Output();
    }

    updateProductProfile(normalizedProfile);
    setTargetMarket(localTargetMarket);
    setCompetitorAsins(validAsins);
    setCoreSellingPoints(localCoreSellingPoints.trim());
    setProductImages(localProductImages);
    setVisionAnalysis(localVisionAnalysis);
    setSupportAssets({
      abaReport: localAbaReport,
      rufusScreenshots: localRufusScreenshots,
    });
    setCurrentStep(2);
  };

  const keywordCount = splitCommaValues(localProfile.coreKeywords).length;
  const asinCount = splitCommaValues(localCompetitorAsins).length;
  const canProceed =
    localProfile.productName.trim().length > 0 &&
    localProfile.productCategory.trim().length > 0 &&
    localProfile.productDescription.trim().length > 0 &&
    asinCount > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-white/10 bg-white/[0.03]">
          <CardTitle>Step 1: 产品信息输入</CardTitle>
          <CardDescription>
            先整理产品信息、图片和辅助数据，再进入卖家精灵 + ABA + Rufus 的多源分析流程。
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 p-6">
          <section className="obsidian-soft-card space-y-4 p-5">
            <div className="space-y-1">
              <Label className="text-sm font-semibold">产品白底图</Label>
              <p className="text-xs text-muted-foreground">
                建议上传不同角度产品图，最多 5 张，便于 AI 自动提炼外观与卖点。
              </p>
            </div>

            <ProductImageUpload
              images={localProductImages}
              onChange={handleProductImagesChange}
              maxImages={5}
            />

            <div className="obsidian-inline-note flex items-start gap-2 border-emerald-400/18 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <p>数据安全：本次上传仅用于当前分析，流程完成后不做长期存储。</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {localProductImages.length > 0 ? (
                <Badge variant="outline">已上传 {localProductImages.length} 张产品图</Badge>
              ) : null}
              {localVisionAnalysis ? (
                <Badge className="bg-emerald-600">图片卖点分析已完成</Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleAnalyzeImages}
                disabled={analyzing || localProductImages.length === 0}
                className="obsidian-action"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    图片分析中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {localVisionAnalysis ? "重新分析图片" : "AI 分析图片"}
                  </>
                )}
              </Button>

              {localVisionAnalysis ? (
                <Button type="button" variant="outline" onClick={fillSellingPoints}>
                  回填差异化卖点
                </Button>
              ) : null}
            </div>

            {analysisError ? (
              <AiRequestErrorAlert
                heading="图片分析失败"
                error={analysisError}
                runtimeConfig={aiRuntimeSettings.imageAnalysis}
                actions={
                  <Button type="button" variant="outline" onClick={handleAnalyzeImages}>
                    重新尝试
                  </Button>
                }
              />
            ) : null}
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="brand-name">品牌名称</Label>
              <Input
                id="brand-name"
                value={localProfile.brandName}
                onChange={(event) => updateProfileField("brandName", event.target.value)}
                placeholder="例：Essential Aura"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-name">产品名称 *</Label>
              <Input
                id="product-name"
                value={localProfile.productName}
                onChange={(event) => updateProfileField("productName", event.target.value)}
                placeholder="例：Natural Bristle Body Brush"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-category">产品品类 *</Label>
              <Select
                value={localProfile.productCategory}
                onValueChange={(value) => {
                  if (value) {
                    updateProfileField("productCategory", value);
                  }
                }}
              >
                <SelectTrigger id="product-category">
                  <SelectValue placeholder="选择品类" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="market">目标市场</Label>
              <Select
                value={localTargetMarket}
                onValueChange={(value) => {
                  if (value) {
                    setLocalTargetMarket(value);
                  }
                }}
              >
                <SelectTrigger id="market">
                  <SelectValue placeholder="选择目标市场" />
                </SelectTrigger>
                <SelectContent>
                  {marketOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <div className="space-y-2">
            <Label htmlFor="product-description">产品描述 *</Label>
            <Textarea
              id="product-description"
              rows={4}
              value={localProfile.productDescription}
              onChange={(event) =>
                updateProfileField("productDescription", event.target.value)
              }
              placeholder="描述材质、尺寸、功能特点和主要使用场景。"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="selling-points">差异化卖点</Label>
            <Textarea
              id="selling-points"
              rows={4}
              value={localCoreSellingPoints}
              onChange={(event) => setLocalCoreSellingPoints(event.target.value)}
              placeholder="相对竞品的独特优势，例如材质升级、结构优化、礼盒属性等。"
            />
          </div>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="keywords">核心关键词</Label>
                <Badge variant="outline">{keywordCount}/{MAX_CORE_KEYWORDS}</Badge>
              </div>
              <Input
                id="keywords"
                value={localProfile.coreKeywords}
                onChange={(event) => updateProfileField("coreKeywords", event.target.value)}
                placeholder="用逗号分隔，例如：body brush, dry brushing"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="asins">竞品 ASIN *</Label>
                <Badge variant="outline">{asinCount}/3</Badge>
              </div>
              <Input
                id="asins"
                value={localCompetitorAsins}
                onChange={(event) => setLocalCompetitorAsins(event.target.value)}
                placeholder="用逗号分隔，例如：B0XXXXXXX, B0YYYYYYY"
              />
            </div>
          </section>

          <section className="obsidian-soft-card space-y-4 p-5">
            <div className="space-y-1">
              <CardTitle className="text-base">辅助数据文件</CardTitle>
              <CardDescription>
                VOC 诊断继续沿用现有 Step 3，这里只补充 ABA 与 Rufus 数据源。
              </CardDescription>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="obsidian-soft-card space-y-3 border-dashed p-4">
                <Label className="text-sm font-semibold">ABA 搜索词报告 (CSV)</Label>
                <label className="obsidian-empty-state flex cursor-pointer flex-col items-center justify-center gap-2 px-4 py-8 text-center hover:bg-white/[0.05]">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleAbaFileChange}
                  />
                  {abaUploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-[#FF9900]" />
                  ) : (
                    <FileSpreadsheet className="h-6 w-6 text-stone-300/80" />
                  )}
                  <p className="text-sm font-medium">
                    {abaUploading ? "正在读取 ABA 报告..." : "点击上传 ABA CSV"}
                  </p>
                </label>

                {abaError ? (
                  <div className="obsidian-inline-note rounded-lg border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                    {abaError}
                  </div>
                ) : null}

                {localAbaReport ? (
                  <div className="obsidian-soft-card space-y-2 border-emerald-400/18 bg-emerald-500/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-emerald-900">
                          {localAbaReport.fileName}
                        </p>
                        <p className="text-xs text-emerald-700">
                          已读取 {localAbaReport.rows.length} 行预览数据
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setLocalAbaReport(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {localAbaReport.headers.map((header) => (
                        <Badge key={header} variant="outline">
                          {header}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="obsidian-soft-card space-y-3 border-dashed p-4">
                <Label className="text-sm font-semibold">Rufus 问答截图</Label>
                <label className="obsidian-empty-state flex cursor-pointer flex-col items-center justify-center gap-2 px-4 py-8 text-center hover:bg-white/[0.05]">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleRufusFileChange}
                  />
                  {rufusUploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-[#FF9900]" />
                  ) : (
                    <Upload className="h-6 w-6 text-stone-300/80" />
                  )}
                  <p className="text-sm font-medium">
                    {rufusUploading ? "正在处理截图..." : "点击上传 Rufus 截图"}
                  </p>
                </label>

                {rufusError ? (
                  <div className="obsidian-inline-note rounded-lg border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                    {rufusError}
                  </div>
                ) : null}

                {localRufusScreenshots.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {localRufusScreenshots.map((item) => (
                      <div key={item.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                        <div className="relative aspect-[4/3] bg-white/[0.03]">
                          <Image
                            src={item.preview}
                            alt={item.name}
                            fill
                            unoptimized
                            sizes="(max-width: 768px) 50vw, 25vw"
                            className="object-cover"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2 h-7 w-7"
                            onClick={() =>
                              setLocalRufusScreenshots((current) =>
                                current.filter((entry) => entry.id !== item.id)
                              )
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="truncate px-3 py-2 text-xs text-stone-300/80">
                          {item.name}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          {localVisionAnalysis ? (
            <Card className="border-[#FF9900]/25 bg-orange-50/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-5 w-5 text-[#FF9900]" />
                  图片卖点分析结果
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Eye className="h-4 w-4 text-blue-600" />
                      <Label className="text-sm font-semibold">外观描述</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {localVisionAnalysis.appearance}
                    </p>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-emerald-600" />
                      <Label className="text-sm font-semibold">材质判断</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {localVisionAnalysis.material}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Star className="h-4 w-4 text-violet-600" />
                      <Label className="text-sm font-semibold">核心特征</Label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {localVisionAnalysis.features.map((feature) => (
                        <Badge key={feature} variant="outline">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      <Label className="text-sm font-semibold">优化建议</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {localVisionAnalysis.suggestions}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {formError ? (
            <div className="obsidian-inline-note rounded-lg border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {formError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleNext}
          disabled={!canProceed}
          className="obsidian-action"
        >
          下一步：数据分析
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
