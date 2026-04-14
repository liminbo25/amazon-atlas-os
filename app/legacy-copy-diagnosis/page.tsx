import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Boxes,
  ClipboardList,
  Layers3,
  Megaphone,
  MessagesSquare,
  PanelTop,
  Search,
  Target,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { LegacyCopyDiagnosisWorkbench } from "@/components/legacy-copy-diagnosis/legacy-copy-diagnosis-workbench";
import { StudioHeader } from "@/components/portal/studio-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type WorkbookLayer = {
  title: string;
  summary: string;
  dimensions: string[];
  upgrade: string;
};

type DiagnosisPillar = {
  title: string;
  weight: number;
  intent: string;
  basedOn: string[];
  checks: string[];
  outputs: string[];
};

type WorkflowStep = {
  step: string;
  title: string;
  description: string;
  deliverables: string[];
};

type Deliverable = {
  title: string;
  description: string;
  items: string[];
};

const workbookLayers: WorkbookLayer[] = [
  {
    title: "基础对比",
    summary: "表格已经覆盖标题、品牌、价格、BSR、子类目、评分、变体、A+、视频、FBA、上架时间和 occasion 推断。",
    dimensions: [
      "标题与核心词是否缺位",
      "价格带与 BSR 表现是否匹配",
      "类目、变体数、上架时间是否影响权重",
      "基础资产是否齐全",
    ],
    upgrade: "升级后不只看输赢，还会判断这些指标是流量瓶颈、转化瓶颈，还是结构性老化。",
  },
  {
    title: "流量关键词 TOP30",
    summary: "表格已经有月搜索量、自然位、广告位、PPC 竞价、SPR、购买率和竞争度分析。",
    dimensions: [
      "核心大词缺失",
      "自然位 vs 广告位的覆盖差",
      "大词、泛词、场景词的占位结构",
      "词包差距带来的流量天花板",
    ],
    upgrade: "升级后会补上索引路径、标题前 80 字权重、后台 ST 冗余、自然流量依赖度和关键词分层优先级。",
  },
  {
    title: "Listing 优缺点",
    summary: "表格已经比较了标题、五点、A+、类目、关键词覆盖、广告策略、场景覆盖和价格策略。",
    dimensions: [
      "竞品做对了什么",
      "当前 listing 哪些位置浪费权重",
      "场景词与类目是否匹配",
      "广告是否在替内容补课",
    ],
    upgrade: "升级后会把每个问题拆成可检查项，而不是停留在一句优缺点描述。",
  },
  {
    title: "优化方案与覆盖矩阵",
    summary: "表格已经给出新标题、五点方向和关键词覆盖矩阵。",
    dimensions: [
      "标题重写逻辑",
      "五点内容如何承接关键词",
      "核心词在哪个字段缺口最大",
      "高流量词有没有前置",
    ],
    upgrade: "升级后会明确每一段文案应该解决哪个转化问题、承接哪类关键词、匹配哪类人群与场景。",
  },
  {
    title: "行动清单",
    summary: "表格已经按 P0 / P1 / P2 排了标题、五点、Search Terms、类目和广告动作。",
    dimensions: [
      "先改什么",
      "每个动作预计影响什么",
      "执行时间点",
      "短期和中期动作如何分层",
    ],
    upgrade: "升级后会补上风险等级、依赖关系、验证指标和实验窗口，形成真正可复盘的优化闭环。",
  },
];

const diagnosisPillars: DiagnosisPillar[] = [
  {
    title: "搜索相关性与索引路径",
    weight: 18,
    intent: "先判断老品是不是根本没有占住该占的词，以及词到底卡在标题、五点、A+ 还是后台搜索词。",
    basedOn: ["标题", "流量关键词 TOP30", "关键词覆盖矩阵"],
    checks: [
      "标题前 80 字是否覆盖类目词 + 主需求词 + 高意图场景词",
      "泛词、属性词、场景词、季节词是否分层布局，而不是只堆一类词",
      "Search Terms 是否承接遗漏词，而不是重复标题和五点",
      "自然排名缺失的词，是未索引、低相关，还是广告替代型覆盖",
    ],
    outputs: ["关键词缺口图", "字段级补词建议"],
  },
  {
    title: "类目、场景与受众映射",
    weight: 12,
    intent: "确认 listing 的类目定位和内容表达，是否真的匹配高转化场景，而不是只在低价值流量里打转。",
    basedOn: ["子类目", "occasion 推断", "场景覆盖", "类目放置"],
    checks: [
      "Browse node、occasion_type、主题场景词是否一致",
      "是否覆盖 wedding guest、formal、vacation、church 等高转化细分场景",
      "卖点和图片是否在讲同一类人群，而不是场景割裂",
      "是否存在过时季节词、错位场景词、泛化人群词",
    ],
    outputs: ["场景覆盖热区", "类目调整建议"],
  },
  {
    title: "转化卖点与证据链",
    weight: 14,
    intent: "老品文案不是只要有词，还要能回答用户为什么买、为什么信、为什么比竞品更值。",
    basedOn: ["五点描述", "面料", "评论信号", "Listing 优缺点"],
    checks: [
      "Bullet 1-5 是否分别承接主卖点、材质/功能、使用场景、穿搭/搭配、尺码/售后",
      "每个卖点有没有评论、材质参数、细节结构做证据支撑",
      "是否有关键异议没有被提前回答，例如透不透、勒不勒、尺码准不准",
      "是否只是堆关键词，没有真正完成价值表达",
    ],
    outputs: ["卖点缺口清单", "证据强化建议"],
  },
  {
    title: "移动端结构与可读性",
    weight: 10,
    intent: "很多老品不是没内容，而是用户在手机端根本看不到重点，或者第一眼就被劝退。",
    basedOn: ["标题", "五点描述", "优缺点"],
    checks: [
      "标题是否过长，核心转化词是否被截断",
      "五点前 12-18 个词是否先讲结果，再讲细节",
      "是否把尺码提示、洗护、免责声明放在高权重位置",
      "是否存在过度分号堆砌、重复词、语义噪音和弱开头",
    ],
    outputs: ["移动端截断风险", "段落重排建议"],
  },
  {
    title: "A+、图片与视频资产协同",
    weight: 10,
    intent: "老品优化不能只改文字，文案要和图、A+、视频共同完成说服，而不是互相打架。",
    basedOn: ["A+/EBC", "视频", "A+ 内容"],
    checks: [
      "主图、辅图、A+、视频的主叙事是否一致",
      "A+ Alt Text 是否系统覆盖长尾词、场景词和功能词",
      "图片是否补足标题和五点无法高效解释的卖点",
      "视频是否承担强场景带入或使用演示，而不是重复图文",
    ],
    outputs: ["资产协同缺口", "A+ / 图片 / 视频补强建议"],
  },
  {
    title: "口碑、价格与价值锚点",
    weight: 10,
    intent: "老品往往不是简单降价就能解决，关键是当前价格有没有被文案和口碑共同托住。",
    basedOn: ["价格", "评分", "评论数量", "价格策略"],
    checks: [
      "评分和评论量是护城河，还是只是旧评论沉淀",
      "差评高频点是否直接削弱当前核心卖点",
      "价格、优惠、品牌力、材质表达是否处于同一价值层级",
      "当前价格带如果继续卷低价，会不会伤害利润和品牌定位",
    ],
    outputs: ["价值锚点判断", "价格表达优化建议"],
  },
  {
    title: "流量结构与广告依赖",
    weight: 10,
    intent: "如果老品几乎全靠广告撑着，文案问题就不是美化问题，而是自然流量结构问题。",
    basedOn: ["流量关键词 TOP30", "广告策略", "关键词覆盖"],
    checks: [
      "核心词是自然排名驱动，还是 SB / SP 强行托住",
      "是否存在大词无自然位、长尾词无承接、广告位替代内容位",
      "广告词包与文案词包是否脱节，导致点击能来但内容吃不住",
      "哪些词应该先做自然位，哪些词保留为投放补充",
    ],
    outputs: ["自然/广告结构诊断", "词包协同方案"],
  },
  {
    title: "变体治理与运营健康",
    weight: 8,
    intent: "老品常见问题不是单条文案差，而是父子体、库存、变体命名把权重稀释掉了。",
    basedOn: ["变体数", "FBA", "上架时间", "基础对比"],
    checks: [
      "变体数是否过多，导致流量和评论被稀释",
      "父子体命名、颜色词、尺码词是否影响搜索理解",
      "是否有低库存、断货、旧版本内容拖累整体表现",
      "老品更新时间是否过久，内容与当季需求脱节",
    ],
    outputs: ["变体治理建议", "运营健康提示"],
  },
  {
    title: "合规、时效与实验计划",
    weight: 8,
    intent: "诊断框架最后必须落回到什么先改、怎么测、多久复盘，否则动作很快就会失焦。",
    basedOn: ["行动清单", "优化方案", "标题与五点建议"],
    checks: [
      "是否存在年份、季节、功效等高风险或过期表达",
      "改标题、改五点、改 A+、改属性之间的依赖顺序是否明确",
      "每个动作有没有配套的 CTR、CVR、自然位、词量验证指标",
      "P0/P1/P2 之外，是否定义了 7 天、14 天、28 天复盘窗口",
    ],
    outputs: ["实验排期", "风险与验证面板"],
  },
];

const workflow: WorkflowStep[] = [
  {
    step: "01",
    title: "输入采集",
    description: "输入当前 ASIN 文案、竞品 2-5 个、核心词包、类目信息、A+ / 视频资产和评论摘要。",
    deliverables: ["当前 listing 快照", "竞品对标池", "关键词分层包"],
  },
  {
    step: "02",
    title: "诊断打分",
    description: "按 100 分模型跑 9 大支柱，拆出流量短板、转化短板和资产短板，避免所有问题混成一句“文案差”。",
    deliverables: ["总分与分项分", "红黄绿风险标签", "字段级问题定位"],
  },
  {
    step: "03",
    title: "改写策略",
    description: "不是直接生成一版新文案，而是先明确每个字段应该承担什么任务，再决定怎么改。",
    deliverables: ["标题策略", "Bullet 角色分工", "A+ / ST / 属性补位方案"],
  },
  {
    step: "04",
    title: "优先级执行",
    description: "按 P0 / P1 / P2 排序，区分当天可改、需要品牌素材、需要广告联动和需要运营配合的动作。",
    deliverables: ["14 天动作表", "依赖关系", "责任归属"],
  },
  {
    step: "05",
    title: "验证闭环",
    description: "每次改动都要看 CTR、CVR、自然排名、索引词数、广告依赖度是否同步改善，形成老品迭代闭环。",
    deliverables: ["7/14/28 天复盘", "继续放大 or 回滚建议"],
  },
];

const deliverables: Deliverable[] = [
  {
    title: "诊断总览",
    description: "一眼看清老品为什么卡住，不再只有零散建议。",
    items: ["100 分总分", "9 大支柱分项分", "流量 / 转化 / 资产三类问题标签"],
  },
  {
    title: "字段级改写蓝图",
    description: "每个字段该怎么改、为什么改、优先补哪些词，都拆到位。",
    items: ["标题结构重写", "五点角色分工", "A+ Alt Text 与 ST 补词方向"],
  },
  {
    title: "执行优先级",
    description: "避免团队每个点都想改，最后没有一个点改透。",
    items: ["P0/P1/P2 动作表", "依赖关系", "跨团队协作提示"],
  },
  {
    title: "验证与实验计划",
    description: "模块不是出一份文档就结束，而是把后续验证路径带出来。",
    items: ["CTR / CVR 观察项", "关键词恢复节奏", "实验窗口与复盘点"],
  },
];

const scoreBands = [
  {
    range: "90-100",
    label: "结构健康型",
    note: "主要做扩词、扩场景和资产放大，不建议大改核心表达。",
  },
  {
    range: "75-89",
    label: "可提效型",
    note: "已经有基础，但存在明显缺词、弱场景或证据表达不足的问题。",
  },
  {
    range: "60-74",
    label: "停滞风险型",
    note: "自然流量和转化结构都在吃老本，需要做系统性重构。",
  },
  {
    range: "<60",
    label: "重做优先型",
    note: "标题、类目、卖点、资产和广告协同都存在明显断层，应按 P0 全面修正。",
  },
];

const pillarIcons: LucideIcon[] = [
  Search,
  Target,
  MessagesSquare,
  PanelTop,
  Layers3,
  BadgeCheck,
  Megaphone,
  Boxes,
  TriangleAlert,
];

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-7 text-slate-600">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function LegacyCopyDiagnosisPage() {
  const totalWeight = diagnosisPillars.reduce((sum, pillar) => sum + pillar.weight, 0);

  return (
    <div className="min-h-screen pb-10">
      <StudioHeader
        eyebrow="老品文案诊断"
        title="把老品 listing 的流量停滞、转化疲软和内容老化，拆成一套真正可执行的诊断优化框架。"
        description="这不是把竞品表换个排版，而是把旧品文案优化升级成一个独立模块：先定位问题属于搜索、转化、资产还是运营结构，再输出字段级重写、优先级动作和验证节奏。"
        badge="Framework-first audit surface"
      />

      <LegacyCopyDiagnosisWorkbench />

      <section className="page-shell mt-8 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="glass-panel p-6 sm:p-7">
          <p className="section-kicker">Module brief</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            这个模块会把“分析表”升级成“诊断系统”。
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate-600">
            你给的 Excel 很强，已经有竞品对比、关键词对标、优缺点和行动清单。但它更像一次性的人工分析稿。
            这个新模块要承担的是标准化诊断能力，所以我把它扩成了 9 大支柱、100 分打分、字段级问题归因、
            P0/P1/P2 动作和 7/14/28 天验证节奏。
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-5">
              <p className="section-kicker">Workbook</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">
                {workbookLayers.length}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                个表格层次被提炼成模块输入，不再只是一次性比对。
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-5">
              <p className="section-kicker">Pillars</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">
                {diagnosisPillars.length}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                大诊断支柱覆盖搜索、转化、资产、商业和执行层。
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-5">
              <p className="section-kicker">Scoring</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">
                {totalWeight}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                分模型让团队知道先救哪里，而不是所有字段一起动。
              </p>
            </div>
          </div>
        </article>

        <article className="glass-panel p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="section-kicker">What is new</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                比现有表格更完整的地方
              </h2>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {[
              "从“竞品谁更强”升级为“当前 ASIN 卡在什么环节”。",
              "从“关键词缺口”升级为“字段级索引路径诊断”。",
              "从“文案建议”升级为“内容、类目、资产、广告协同方案”。",
              "从“动作清单”升级为“优先级 + 风险 + 验证闭环”。",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[1.35rem] border border-slate-200 bg-white/85 px-4 py-4 text-sm leading-7 text-slate-600"
              >
                {item}
              </div>
            ))}
          </div>

          <Link
            href="/listing-studio"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Link with Listing Studio
            <ArrowRight className="h-4 w-4" />
          </Link>
        </article>
      </section>

      <section className="page-shell mt-8">
        <div className="glass-panel p-6 sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-kicker">Workbook Basis</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                这份 Excel 里的维度，已经被吸收到模块底盘里。
              </h2>
            </div>
            <Badge variant="secondary" className="w-fit">
              基于你提供的 `Listing竞品分析_优化方案_SIR.xlsx`
            </Badge>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-5">
            {workbookLayers.map((layer) => (
              <Card key={layer.title} className="h-full border-slate-200/80 bg-white/80 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-slate-950">{layer.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-7 text-slate-600">{layer.summary}</p>
                  <BulletList items={layer.dimensions} />
                  <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-600">
                    {layer.upgrade}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="page-shell mt-8">
        <div className="glass-panel p-6 sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-kicker">Diagnosis Framework</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                升级后的老品文案诊断框架
              </h2>
              <p className="mt-3 max-w-4xl text-sm leading-8 text-slate-600">
                每个支柱都明确了来源维度、检查动作和最终输出，方便后面继续接 AI 分析、表单输入或自动打分。
              </p>
            </div>
            <Badge className="w-fit bg-slate-950 text-white hover:bg-slate-950">
              9 大支柱 / 100 分
            </Badge>
          </div>

          <div className="mt-8 grid gap-4 xl:grid-cols-3">
            {diagnosisPillars.map((pillar, index) => {
              const Icon = pillarIcons[index];

              return (
                <Card
                  key={pillar.title}
                  className="h-full border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(245,248,251,0.9))] shadow-none"
                >
                  <CardHeader className="space-y-4 pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                        <Icon className="h-5 w-5" />
                      </div>
                      <Badge variant="secondary">{pillar.weight} 分</Badge>
                    </div>
                    <div>
                      <CardTitle className="text-xl text-slate-950">{pillar.title}</CardTitle>
                      <p className="mt-3 text-sm leading-7 text-slate-600">{pillar.intent}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        来源维度
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pillar.basedOn.map((item) => (
                          <Badge key={`${pillar.title}-${item}`} variant="outline">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        关键检查项
                      </p>
                      <div className="mt-3">
                        <BulletList items={pillar.checks} />
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        模块输出
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pillar.outputs.map((item) => (
                          <Badge key={`${pillar.title}-${item}`} className="bg-white text-slate-700 hover:bg-white">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="page-shell mt-8 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="glass-panel p-6 sm:p-7">
          <p className="section-kicker">Workflow</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            模块执行流程
          </h2>

          <div className="mt-8 space-y-4">
            {workflow.map((item) => (
              <div
                key={item.step}
                className="rounded-[1.5rem] border border-slate-200 bg-white/85 p-5"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                    {item.step}
                  </span>
                  <h3 className="text-xl font-semibold text-slate-950">{item.title}</h3>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-600">{item.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.deliverables.map((deliverable) => (
                    <Badge key={`${item.step}-${deliverable}`} variant="secondary">
                      {deliverable}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-panel p-6 sm:p-7">
          <p className="section-kicker">Outputs</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            交付物与评分口径
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {deliverables.map((item) => (
              <Card key={item.title} className="border-slate-200/80 bg-white/80 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-slate-950">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-7 text-slate-600">{item.description}</p>
                  <BulletList items={item.items} />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-8 rounded-[1.7rem] border border-slate-200 bg-slate-950 p-6 text-white">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/50">
                  Score Bands
                </p>
                <h3 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
                  老品诊断分数解释
                </h3>
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              {scoreBands.map((band) => (
                <div
                  key={band.range}
                  className="rounded-[1.35rem] border border-white/10 bg-white/6 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-950">
                      {band.range}
                    </span>
                    <p className="text-base font-semibold">{band.label}</p>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-white/75">{band.note}</p>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
