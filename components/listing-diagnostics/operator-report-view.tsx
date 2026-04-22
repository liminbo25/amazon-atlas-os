"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatEvidenceVerificationLabel,
  type ListingDiagnosticsEvidenceRow,
} from "@/lib/listing-diagnostics/reporting";
import type {
  ListingDiagnosticsOperatorIssueRow,
  ListingDiagnosticsResult,
  ListingDiagnosticsSourceCoverageItem,
} from "@/lib/listing-diagnostics/types";

interface OperatorReportViewProps {
  result: ListingDiagnosticsResult;
  evidenceRows: ListingDiagnosticsEvidenceRow[];
}

export function OperatorReportView({
  result,
  evidenceRows,
}: OperatorReportViewProps) {
  const report = result.operatorReport;

  return (
    <Tabs
      defaultValue="diagnosis"
      className="glass-panel rounded-[2rem] border border-white/70 bg-white/85 p-5"
    >
      <TabsList variant="line">
        <TabsTrigger value="diagnosis">运营诊断</TabsTrigger>
        <TabsTrigger value="keywords">关键词竞争</TabsTrigger>
        <TabsTrigger value="optimization">优化方案</TabsTrigger>
        <TabsTrigger value="roadmap">行动清单</TabsTrigger>
        <TabsTrigger value="evidence">原始证据</TabsTrigger>
      </TabsList>

      <TabsContent value="diagnosis" className="space-y-5 pt-5">
        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader className="border-b border-slate-200/80">
            <CardTitle className="text-xl text-slate-950">基础对比</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>指标</TableHead>
                  <TableHead>目标 ASIN</TableHead>
                  <TableHead>对标竞品</TableHead>
                  <TableHead>对比分析</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.comparisonRows.map((row) => (
                  <TableRow key={row.metric}>
                    <TableCell className="font-medium text-slate-900">
                      {row.metric}
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm text-slate-700">
                      {row.targetValue}
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm text-slate-700">
                      {row.competitorValue}
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm leading-7 text-slate-600">
                      {row.analysis}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          {report.gapRows.map((row) => (
            <Card key={row.dimension} className="border-slate-200/80 bg-white/90">
              <CardHeader className="border-b border-slate-200/80">
                <CardTitle className="text-lg text-slate-950">{row.dimension}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
                <GapPanel
                  title={`目标 ASIN ${result.request.targetAsin}`}
                  strengths={row.targetStrengths}
                  weaknesses={row.targetWeaknesses}
                />
                <GapPanel
                  title={`对标 ${report.primaryCompetitorLabel}`}
                  strengths={row.competitorStrengths}
                  weaknesses={row.competitorWeaknesses}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4">
          {report.issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      </TabsContent>

      <TabsContent value="keywords" className="pt-5">
        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader className="border-b border-slate-200/80">
            <CardTitle className="text-xl text-slate-950">流量关键词 TOP30</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>keyword</TableHead>
                  <TableHead>月搜索量</TableHead>
                  <TableHead>目标自然位</TableHead>
                  <TableHead>目标广告位</TableHead>
                  <TableHead>竞品自然位</TableHead>
                  <TableHead>竞品广告位</TableHead>
                  <TableHead>购买占比</TableHead>
                  <TableHead>竞争分析</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.keywordRows.map((row) => (
                  <TableRow key={row.keyword}>
                    <TableCell className="font-medium text-slate-900">
                      {row.keyword}
                    </TableCell>
                    <TableCell>{row.monthlySearchVolume.toLocaleString("en-US")}</TableCell>
                    <TableCell>{row.targetOrganicRank}</TableCell>
                    <TableCell>{row.targetSponsoredRank}</TableCell>
                    <TableCell>{row.competitorOrganicRank}</TableCell>
                    <TableCell>{row.competitorSponsoredRank}</TableCell>
                    <TableCell>{row.purchaseShare}</TableCell>
                    <TableCell className="whitespace-normal text-sm leading-7 text-slate-600">
                      {row.diagnosis}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="optimization" className="space-y-5 pt-5">
        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader className="border-b border-slate-200/80">
            <CardTitle className="text-xl text-slate-950">新 Listing 优化方案</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">推荐标题</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {report.optimizationPlan.recommendedTitle}
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {report.optimizationPlan.titleLogic}
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">核心关键词</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {report.optimizationPlan.coreKeywords.map((keyword) => (
                  <Badge key={keyword} variant="outline">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="border-slate-200/80 bg-white/95">
                <CardHeader className="border-b border-slate-200/80">
                  <CardTitle className="text-lg text-slate-950">五点描述</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  {report.optimizationPlan.bullets.map((bullet) => (
                    <div
                      key={bullet.label}
                      className="rounded-[1.3rem] border border-slate-200 bg-slate-50/80 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{bullet.label}</Badge>
                        <Badge variant="secondary">{bullet.focus}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-slate-700">
                        {bullet.text}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="border-slate-200/80 bg-white/95">
                  <CardHeader className="border-b border-slate-200/80">
                    <CardTitle className="text-lg text-slate-950">Search Terms</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6">
                    {report.optimizationPlan.searchTerms.map((row) => (
                      <div
                        key={row.label}
                        className="rounded-[1.3rem] border border-slate-200 bg-slate-50/80 p-4"
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {row.label}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-slate-700">
                          {row.text}
                        </p>
                      </div>
                    ))}
                    <p className="text-sm leading-7 text-slate-600">
                      {report.optimizationPlan.searchTermStrategy}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white/95">
                  <CardHeader className="border-b border-slate-200/80">
                    <CardTitle className="text-lg text-slate-950">
                      A+ Alt Text 与后台属性
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6">
                    {report.optimizationPlan.aPlusAltText.map((row) => (
                      <div
                        key={row.label}
                        className="rounded-[1.3rem] border border-slate-200 bg-slate-50/80 p-4"
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {row.label}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-slate-700">
                          {row.text}
                        </p>
                      </div>
                    ))}

                    <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-sm font-semibold text-slate-900">
                        occasion_type
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-700">
                        {report.optimizationPlan.occasionType}
                      </p>
                    </div>

                    <p className="text-sm leading-7 text-slate-600">
                      {report.optimizationPlan.altTextStrategy}
                    </p>

                    <ListBlock
                      title="属性与后台建议"
                      items={report.optimizationPlan.attributeRecommendations}
                    />
                    <ListBlock
                      title="执行备注"
                      items={report.optimizationPlan.executionNotes}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader className="border-b border-slate-200/80">
            <CardTitle className="text-xl text-slate-950">关键词覆盖矩阵</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>keyword</TableHead>
                  <TableHead>月搜索量</TableHead>
                  <TableHead>目标标题</TableHead>
                  <TableHead>目标 Bullet</TableHead>
                  <TableHead>目标 ST</TableHead>
                  <TableHead>竞品标题</TableHead>
                  <TableHead>竞品 Bullet</TableHead>
                  <TableHead>新标题</TableHead>
                  <TableHead>新 Bullet</TableHead>
                  <TableHead>新 ST</TableHead>
                  <TableHead>新 Alt Text</TableHead>
                  <TableHead>覆盖结论</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.coverageRows.map((row) => (
                  <TableRow key={row.keyword}>
                    <TableCell className="font-medium text-slate-900">
                      {row.keyword}
                    </TableCell>
                    <TableCell>{row.monthlySearchVolume.toLocaleString("en-US")}</TableCell>
                    <TableCell>{row.targetTitle}</TableCell>
                    <TableCell>{row.targetBullets}</TableCell>
                    <TableCell>{row.targetSearchTerms}</TableCell>
                    <TableCell>{row.competitorTitle}</TableCell>
                    <TableCell>{row.competitorBullets}</TableCell>
                    <TableCell>{row.optimizedTitle}</TableCell>
                    <TableCell>{row.optimizedBullets}</TableCell>
                    <TableCell>{row.optimizedSearchTerms}</TableCell>
                    <TableCell>{row.optimizedAltText}</TableCell>
                    <TableCell className="whitespace-normal text-sm leading-7 text-slate-600">
                      {row.insight}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="roadmap" className="pt-5">
        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader className="border-b border-slate-200/80">
            <CardTitle className="text-xl text-slate-950">行动清单</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>优先级</TableHead>
                  <TableHead>行动项</TableHead>
                  <TableHead>预期效果</TableHead>
                  <TableHead>时间节点</TableHead>
                  <TableHead>验收方式</TableHead>
                  <TableHead>责任角色</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.roadmap.map((row, index) => (
                  <TableRow key={`${row.priority}-${index}`}>
                    <TableCell>{row.priority}</TableCell>
                    <TableCell className="whitespace-normal text-sm leading-7 text-slate-700">
                      {row.action}
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm leading-7 text-slate-600">
                      {row.expectedEffect}
                    </TableCell>
                    <TableCell>{row.timeline}</TableCell>
                    <TableCell className="whitespace-normal text-sm leading-7 text-slate-600">
                      {row.verification}
                    </TableCell>
                    <TableCell>{row.owner}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="evidence" className="space-y-5 pt-5">
        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader className="border-b border-slate-200/80">
            <CardTitle className="text-xl text-slate-950">证据明细</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>信号</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>可信度</TableHead>
                  <TableHead>证据等级</TableHead>
                  <TableHead>证据内容</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evidenceRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-slate-900">
                      {row.signal}
                    </TableCell>
                    <TableCell>{localizeEvidenceSource(row.source)}</TableCell>
                    <TableCell>{Math.round(row.confidence * 100)}%</TableCell>
                    <TableCell>{formatEvidenceVerificationLabel(row.verification)}</TableCell>
                    <TableCell className="whitespace-normal text-sm leading-7 text-slate-600">
                      {row.evidence}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader className="border-b border-slate-200/80">
            <CardTitle className="text-xl text-slate-950">数据覆盖</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>数据项</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>可用数量</TableHead>
                  <TableHead>可信度</TableHead>
                  <TableHead>说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.sourceCoverage.map((item) => (
                  <CoverageRow key={item.id} item={item} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function GapPanel({
  title,
  strengths,
  weaknesses,
}: {
  title: string;
  strengths: string[];
  weaknesses: string[];
}) {
  return (
    <div className="space-y-4 rounded-[1.4rem] border border-slate-200 bg-slate-50/70 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <ListBlock title="优势" items={strengths} />
      <ListBlock title="不足" items={weaknesses} />
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        {title}
      </p>
      <div className="grid gap-2 text-sm leading-7 text-slate-700">
        {items.length > 0 ? (
          items.map((item) => <p key={item}>- {item}</p>)
        ) : (
          <p className="text-slate-500">- 暂无</p>
        )}
      </div>
    </div>
  );
}

function IssueCard({ issue }: { issue: ListingDiagnosticsOperatorIssueRow }) {
  return (
    <Card className="border-slate-200/80 bg-white/90">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={issue.priority.startsWith("P0") ? "destructive" : "outline"}>
            {issue.priority}
          </Badge>
          <Badge variant="outline">{issue.dimension}</Badge>
          <Badge
            variant={
              issue.issueStatus === "已确认问题" || issue.evidenceLevel !== "待验证假设"
                ? "secondary"
                : "outline"
            }
          >
            {issue.issueStatus}
          </Badge>
          <Badge variant="outline">{issue.evidenceLevel}</Badge>
          <Badge variant="outline">{issue.impact}</Badge>
        </div>

        <div>
          <p className="text-lg font-semibold text-slate-950">{issue.title}</p>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            {issue.evidenceSummary}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DetailPanel label="当前表现" value={issue.symptom} />
          <DetailPanel label="根因诊断" value={issue.rootCause} />
          <DetailPanel label="建议动作" value={issue.recommendation} />
          <DetailPanel label="修改位置" value={issue.whereToChange} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DetailPanel label="预期影响" value={issue.expectedImpact} />
          <DetailPanel label="验收动作" value={issue.verificationAction} />
        </div>
      </CardContent>
    </Card>
  );
}

function DetailPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm leading-7 text-slate-700">{value || "待补充"}</p>
    </div>
  );
}

function CoverageRow({ item }: { item: ListingDiagnosticsSourceCoverageItem }) {
  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="font-medium text-slate-900">{localizeCoverageLabel(item.id)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {localizeEvidenceSource(item.source)}
          </p>
        </div>
      </TableCell>
      <TableCell>{mapCoverageStatus(item.status)}</TableCell>
      <TableCell>
        {item.available} / {item.expected}
      </TableCell>
      <TableCell>{Math.round(item.confidence * 100)}%</TableCell>
      <TableCell className="whitespace-normal text-sm text-slate-600">
        {localizeCoverageDetail(item.id, item.detail)}
      </TableCell>
    </TableRow>
  );
}

function mapCoverageStatus(status: ListingDiagnosticsSourceCoverageItem["status"]) {
  switch (status) {
    case "covered":
      return "完整";
    case "partial":
      return "部分";
    case "missing":
      return "缺失";
  }
}

function localizeEvidenceSource(source: string): string {
  if (source === "SellerSprite MCP") {
    return "SellerSprite";
  }

  if (source === "Amazon SP-API") {
    return "Amazon SP-API";
  }

  if (source === "Derived benchmark") {
    return "竞品基准推断";
  }

  return source;
}

function localizeCoverageLabel(id: string): string {
  switch (id) {
    case "target-listing":
      return "目标 Listing 快照";
    case "target-negative-reviews":
      return "目标差评";
    case "target-positive-reviews":
      return "目标好评";
    case "target-keywords":
      return "目标关键词";
    case "competitor-listings":
      return "竞品 Listing 快照";
    case "competitor-reviews":
      return "竞品评论";
    case "competitor-keywords":
      return "竞品关键词";
    case "derived-benchmark":
      return "竞品基准模型";
    case "sp-api-catalog":
      return "SP-API 目录验证";
    case "sp-api-account-listing":
      return "SP-API 账号 Listing 验证";
    case "sp-api-account-restrictions":
      return "SP-API 限制验证";
    default:
      return id;
  }
}

function localizeCoverageDetail(id: string, detail: string): string {
  switch (id) {
    case "target-listing":
      return "目标 ASIN 已获取到标题、Bullet、价格和评分等前台基础信息。";
    case "target-negative-reviews":
      return detail.replace("negative reviews collected for the target ASIN.", "条目标差评已采集。");
    case "target-positive-reviews":
      return detail.replace("positive reviews collected for the target ASIN.", "条目标好评已采集。");
    case "target-keywords":
      return detail.replace("traffic keywords collected for the target ASIN.", "个目标关键词已采集。");
    case "competitor-listings":
      return "当前竞品 Listing 样本已用于构建基准对比。";
    case "competitor-reviews":
      return "当前竞品评论样本已用于转化信号与主题判断。";
    case "competitor-keywords":
      return "当前竞品关键词样本已用于关键词竞争判断。";
    case "derived-benchmark":
      return "竞品均值和 pack-level 对比来自当前已采集的竞品样本。";
    default:
      return detail;
  }
}
