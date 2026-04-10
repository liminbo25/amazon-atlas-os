"use client";

import { useState } from "react";
import { ProductImageUpload } from "@/components/ProductImageUpload";
import {
  AiRequestErrorAlert,
  ApiRequestError,
  normalizeApiRequestError,
  parseApiRequestError,
} from "@/components/AiRequestErrorAlert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  AiRuntimeRequestConfig,
  ProductImage,
  VisionAnalysisResult,
} from "@/lib/types";
import {
  ArrowRight,
  Eye,
  ImageUp,
  Lightbulb,
  Loader2,
  Plus,
  Sparkles,
  Star,
  Wrench,
  X,
} from "lucide-react";

const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

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

export function Step1Analysis() {
  const {
    targetMarket,
    competitorAsins,
    coreSellingPoints,
    productImages,
    visionAnalysis,
    aiRuntimeSettings,
    setTargetMarket,
    setCompetitorAsins,
    setCoreSellingPoints,
    setProductImages,
    setVisionAnalysis,
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

  const [localTargetMarket, setLocalTargetMarket] = useState(targetMarket);
  const [localAsins, setLocalAsins] = useState<string[]>(
    competitorAsins.filter(Boolean).length > 0 ? competitorAsins : ["", "", ""]
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<ApiRequestError | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const imageRuntime: AiRuntimeRequestConfig = {
    task: "imageAnalysis",
    ...aiRuntimeSettings.imageAnalysis,
  };

  const clearStep4Output = () => {
    setListingVersions([]);
    setComplianceResults({});
  };

  const clearStep2To4Data = () => {
    setCompetitorListings([]);
    setCompetitorReviews({});
    setPositiveReviews({});
    setTrafficKeywords({});
    setPainPoints([]);
    setValuePoints([]);
    setCompetitorAnalysis([]);
    clearStep4Output();
  };

  const updateCoreSellingPoints = (value: string) => {
    setCoreSellingPoints(value);
    clearStep4Output();
  };

  const updateAsin = (index: number, value: string) => {
    const nextAsins = [...localAsins];
    nextAsins[index] = value.trim().toUpperCase();
    setLocalAsins(nextAsins);
    setFormError(null);
  };

  const addAsinField = () => {
    if (localAsins.length < 5) {
      setLocalAsins([...localAsins, ""]);
      setFormError(null);
    }
  };

  const removeAsinField = (index: number) => {
    if (localAsins.length > 1) {
      setLocalAsins(localAsins.filter((_, currentIndex) => currentIndex !== index));
      setFormError(null);
    }
  };

  const handleProductImagesChange = (images: ProductImage[]) => {
    setProductImages(images);
    setVisionAnalysis(null);
    setAnalysisError(null);
  };

  const handleAnalyzeImages = async () => {
    if (analyzing) {
      return;
    }

    if (productImages.length === 0) {
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
      const images = productImages.map((image) => {
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
      setVisionAnalysis(data);
    } catch (error) {
      setAnalysisError(normalizeApiRequestError(error, "图片分析失败"));
    } finally {
      setAnalyzing(false);
    }
  };

  const fillSellingPoints = () => {
    if (!visionAnalysis) {
      return;
    }

    const existingLines = coreSellingPoints
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const merged = [...existingLines];
    for (const point of visionAnalysis.sellingPoints) {
      const normalizedPoint = point.trim();
      if (
        normalizedPoint &&
        !merged.some(
          (existingLine) =>
            existingLine.toLowerCase() === normalizedPoint.toLowerCase()
        )
      ) {
        merged.push(normalizedPoint);
      }
    }

    updateCoreSellingPoints(merged.join("\n"));
  };

  const handleNext = () => {
    const validAsins = localAsins
      .map((asin) => asin.trim().toUpperCase())
      .filter(Boolean);
    const invalidAsins = validAsins.filter((asin) => !ASIN_PATTERN.test(asin));

    if (validAsins.length === 0) {
      setFormError("请至少填写 1 个竞品 ASIN。");
      return;
    }

    if (invalidAsins.length > 0) {
      setFormError(
        `以下 ASIN 格式不正确：${invalidAsins.join("、")}。ASIN 需要是 10 位字母或数字。`
      );
      return;
    }

    setFormError(null);

    const currentAsinsKey = competitorAsins.filter(Boolean).join("|");
    const nextAsinsKey = validAsins.join("|");
    const sourceChanged =
      localTargetMarket !== targetMarket || nextAsinsKey !== currentAsinsKey;

    if (sourceChanged) {
      clearStep2To4Data();
    }

    setTargetMarket(localTargetMarket);
    setCompetitorAsins(validAsins);
    setCurrentStep(2);
  };

  const validAsinCount = localAsins.filter((asin) => asin.trim().length > 0).length;
  const canProceed = validAsinCount > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Step 1: 需求确认</CardTitle>
          <CardDescription>
            先确认目标站点、竞品 ASIN 和产品图片，为后续竞品采集、VOC 分析与
            Listing 生成准备输入。
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="market">目标市场</Label>
            <Select
              value={localTargetMarket}
              onValueChange={(value) => {
                if (value) {
                  setLocalTargetMarket(value);
                }
                setFormError(null);
              }}
            >
              <SelectTrigger id="market">
                <SelectValue placeholder="选择目标市场" />
              </SelectTrigger>
              <SelectContent>
                {marketOptions.map((market) => (
                  <SelectItem key={market.value} value={market.value}>
                    {market.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <Label>竞品 ASIN（建议 3 到 5 个）</Label>
                <p className="text-xs text-muted-foreground">
                  已填写 {validAsinCount} 个，ASIN 需要是 10 位字母或数字。
                </p>
              </div>

              {localAsins.length < 5 ? (
                <Button type="button" variant="outline" size="sm" onClick={addAsinField}>
                  <Plus className="mr-1 h-4 w-4" />
                  添加
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              {localAsins.map((asin, index) => (
                <div key={`${index}-${asin}`} className="flex gap-2">
                  <Input
                    placeholder={`竞品 ASIN ${index + 1}，例如 B08EXAMPLE`}
                    value={asin}
                    onChange={(event) => updateAsin(index, event.target.value)}
                    className="font-mono"
                  />
                  {localAsins.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`删除第 ${index + 1} 个 ASIN`}
                      onClick={() => removeAsinField(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>

            {formError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <ProductImageUpload
              images={productImages}
              onChange={handleProductImagesChange}
            />

            <div className="flex flex-wrap gap-2">
              {productImages.length > 0 ? (
                <Badge variant="outline">已上传 {productImages.length} 张图片</Badge>
              ) : null}
              {visionAnalysis ? (
                <Badge className="bg-green-500">图片分析已完成</Badge>
              ) : null}
            </div>

            {productImages.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={handleAnalyzeImages}
                  disabled={analyzing}
                  className="bg-[#FF9900] hover:bg-[#FF9900]/90"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      图片分析中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {visionAnalysis ? "重新分析图片" : "AI 分析图片"}
                    </>
                  )}
                </Button>

                {visionAnalysis ? (
                  <Button type="button" variant="outline" onClick={fillSellingPoints}>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    回填卖点
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <ImageUp className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">
                      上传图片后即可触发 AI 视觉分析
                    </p>
                    <p>
                      结果会提炼外观、材质、核心特征、卖点建议，供后续文案生成直接复用。
                    </p>
                  </div>
                </div>
              </div>
            )}

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

            {productImages.length > 0 && !visionAnalysis && !analysisError && !analyzing ? (
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                图片已准备好，点击上方按钮即可生成 AI 视觉分析结果。
              </div>
            ) : null}
          </div>

          {visionAnalysis ? (
            <Card className="border-[#FF9900]/20 bg-orange-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-5 w-5 text-[#FF9900]" />
                  图片分析结果
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-600" />
                    <Label className="text-sm font-semibold">外观描述</Label>
                  </div>
                  <p className="pl-6 text-sm text-muted-foreground">
                    {visionAnalysis.appearance}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-green-600" />
                    <Label className="text-sm font-semibold">材质判断</Label>
                  </div>
                  <p className="pl-6 text-sm text-muted-foreground">
                    {visionAnalysis.material}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Star className="h-4 w-4 text-purple-600" />
                    <Label className="text-sm font-semibold">核心特征</Label>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-6">
                    {visionAnalysis.features.map((feature) => (
                      <Badge key={feature} variant="outline">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#FF9900]" />
                    <Label className="text-sm font-semibold">可用卖点</Label>
                  </div>
                  <ul className="space-y-1 pl-6 text-sm text-muted-foreground">
                    {visionAnalysis.sellingPoints.map((point) => (
                      <li key={point}>• {point}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-yellow-600" />
                    <Label className="text-sm font-semibold">优化建议</Label>
                  </div>
                  <p className="pl-6 text-sm text-muted-foreground">
                    {visionAnalysis.suggestions}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="selling-points">产品核心卖点（可选）</Label>
            <Textarea
              id="selling-points"
              rows={4}
              value={coreSellingPoints}
              onChange={(event) => updateCoreSellingPoints(event.target.value)}
              placeholder="例如：蓝牙 5.3、40 小时续航、IPX7 防水、人体工学设计..."
            />
            <p className="text-xs text-muted-foreground">
              这里的内容会直接影响 Step 4 的文案生成。更新后会自动清空旧的
              Listing 结果，避免误用过期版本。
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleNext}
          disabled={!canProceed}
          className="bg-[#FF9900] hover:bg-[#FF9900]/90"
        >
          下一步：竞品数据采集
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
