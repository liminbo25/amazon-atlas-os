import type {
  ComplianceField,
  CompliancePlaybookItem,
  ListingVersion,
  PriorityLevel,
  ProhibitedWordMatch,
} from "@/lib/types";

interface ProhibitedWordRule {
  word: string;
  severity: PriorityLevel;
  reason: string;
  category: string;
}

interface CategoryRule {
  area: string;
  riskLevel: PriorityLevel;
  rule: string;
  whyItMatters: string;
  suggestedAction: string;
  evidenceNeeded: string;
  watchTerms: string[];
}

const TITLE_LIMIT = 200;
const SEARCH_TERM_BYTE_LIMIT = 250;
const TITLE_SPECIAL_CHARACTERS = /[!$?_{\}^¬¦]/g;
const GENERIC_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "of",
  "the",
  "to",
  "with",
  "in",
  "on",
  "by",
  "or",
]);

export const PROHIBITED_WORDS: ProhibitedWordRule[] = [
  { word: "best", severity: "high", reason: "绝对化描述，容易触发夸大宣传风险。", category: "绝对化用语" },
  { word: "best seller", severity: "high", reason: "销量或排名声明缺乏持续证据。", category: "绝对化用语" },
  { word: "#1", severity: "high", reason: "排名声明需要充分证据支持。", category: "绝对化用语" },
  { word: "number one", severity: "high", reason: "排名声明需要充分证据支持。", category: "绝对化用语" },
  { word: "guaranteed", severity: "high", reason: "保证式承诺容易超出可证实范围。", category: "结果承诺" },
  { word: "100% effective", severity: "high", reason: "绝对结果承诺不可直接写入 listing。", category: "结果承诺" },
  { word: "cure", severity: "high", reason: "医疗功效声明属于高风险表述。", category: "医疗声明" },
  { word: "treat", severity: "high", reason: "医疗功效声明属于高风险表述。", category: "医疗声明" },
  { word: "diagnose", severity: "high", reason: "医疗功效声明属于高风险表述。", category: "医疗声明" },
  { word: "prevent disease", severity: "high", reason: "疾病预防宣称需要合规资质。", category: "医疗声明" },
  { word: "FDA approved", severity: "high", reason: "认证声明必须有真实资质和适用范围。", category: "认证声明" },
  { word: "clinically proven", severity: "high", reason: "临床证明类表述需要强证据支持。", category: "认证声明" },
  { word: "sale", severity: "medium", reason: "促销词不应写入标题或常驻文案。", category: "促销用语" },
  { word: "discount", severity: "medium", reason: "促销词不应写入标题或常驻文案。", category: "促销用语" },
  { word: "free shipping", severity: "medium", reason: "配送优惠不应写入常驻 listing。", category: "促销用语" },
  { word: "limited time", severity: "medium", reason: "时效性促销信息不适合写进常驻文案。", category: "促销用语" },
  { word: "today only", severity: "medium", reason: "时效性促销信息不适合写进常驻文案。", category: "促销用语" },
  { word: "amazing", severity: "low", reason: "主观夸赞词建议换成可证实描述。", category: "主观用语" },
  { word: "perfect", severity: "low", reason: "主观夸赞词建议换成可证实描述。", category: "主观用语" },
  { word: "incredible", severity: "low", reason: "主观夸赞词建议换成可证实描述。", category: "主观用语" },
  { word: "amazon", severity: "medium", reason: "Listing 不应随意提及平台名。", category: "平台名称" },
  { word: "warranty", severity: "medium", reason: "保修承诺需要与真实政策一致且注意放置位置。", category: "售后声明" },
];

const CATEGORY_RULES: Record<string, CategoryRule[]> = {
  "Beauty & Personal Care": [
    {
      area: "功效宣称",
      riskLevel: "high",
      rule: "避免把美容护理产品写成治疗、修复疾病或医学级结果。",
      whyItMatters: "这类类目最容易因为功效越界或前后对比夸大而触发审核。",
      suggestedAction: "用 routine、feel、appearance improvement 这类可感知结果替代医疗表达。",
      evidenceNeeded: "成分、测试、适用范围、认证文件。",
      watchTerms: ["cure", "heal", "eczema", "acne", "therapy", "clinically"],
    },
  ],
  "Health & Household": [
    {
      area: "健康 / 疾病",
      riskLevel: "high",
      rule: "不要直接写治疗、预防、缓解疾病或症状的结果。",
      whyItMatters: "健康类文案对医疗词和功效词极其敏感。",
      suggestedAction: "改成舒适度、使用场景、辅助体验或材质事实。",
      evidenceNeeded: "合规资质、检测或注册信息。",
      watchTerms: ["cure", "pain", "arthritis", "insomnia", "medical", "FDA"],
    },
  ],
  Baby: [
    {
      area: "安全 / 保护",
      riskLevel: "high",
      rule: "不要把婴童产品写成绝对安全、绝对无害或绝对防护。",
      whyItMatters: "婴童类对 safety claim 和材料证据要求更高。",
      suggestedAction: "把重点放在材质、结构、使用边界和年龄范围。",
      evidenceNeeded: "材质检测、年龄适用说明、警示语。",
      watchTerms: ["safe", "non-toxic", "protect", "100%", "doctor recommended"],
    },
  ],
  "Pet Supplies": [
    {
      area: "宠物治疗 / 镇定",
      riskLevel: "high",
      rule: "避免写成治疗、镇痛、抗焦虑等医学或药物级结果。",
      whyItMatters: "宠物用品同样会触发医疗和功能越界审核。",
      suggestedAction: "改成 comfort、routine、training support 等非医疗表达。",
      evidenceNeeded: "配方、使用说明、功能边界说明。",
      watchTerms: ["anxiety", "treat", "heal", "calm", "pain relief"],
    },
  ],
  Electronics: [
    {
      area: "兼容性 / 续航 / 认证",
      riskLevel: "medium",
      rule: "不要写超范围兼容、绝对续航或未经证实的认证。",
      whyItMatters: "电子类最容易因兼容性、认证和性能承诺被投诉。",
      suggestedAction: "明确兼容型号、使用条件和测试边界。",
      evidenceNeeded: "兼容清单、测试条件、认证文件。",
      watchTerms: ["all devices", "guaranteed", "certified", "waterproof", "fastest"],
    },
  ],
  "Kitchen & Dining": [
    {
      area: "食品接触 / 耐热 / 材质",
      riskLevel: "medium",
      rule: "涉及 food-safe、BPA free、dishwasher safe、heat resistant 时必须有依据。",
      whyItMatters: "厨房用品容易因材质和耐热承诺失真引发合规与差评。",
      suggestedAction: "只写可证实的材质规格和使用边界。",
      evidenceNeeded: "材质检测、耐热测试、适用场景说明。",
      watchTerms: ["food safe", "BPA free", "dishwasher safe", "heat resistant"],
    },
  ],
  "Home & Kitchen": [
    {
      area: "材质 / 耐久 / 适配范围",
      riskLevel: "medium",
      rule: "不要把耐用、适配、无痕、通用等承诺写成绝对化。",
      whyItMatters: "家居类常见投诉来自尺寸、适配范围和耐久预期偏差。",
      suggestedAction: "把尺寸、材质、使用边界和适配范围写具体。",
      evidenceNeeded: "尺寸表、材质说明、适配清单。",
      watchTerms: ["universal", "fits all", "indestructible", "scratch proof"],
    },
  ],
  "Sports & Outdoors": [
    {
      area: "安全 / 防护 / 性能",
      riskLevel: "medium",
      rule: "避免写成绝对防护、绝对防滑、绝对提升表现。",
      whyItMatters: "运动户外类如果安全承诺过满，退货和投诉风险会很高。",
      suggestedAction: "强调设计特征、使用环境和建议搭配，而不是绝对结果。",
      evidenceNeeded: "测试条件、使用边界、材质或结构数据。",
      watchTerms: ["injury prevention", "100% grip", "boost performance", "safest"],
    },
  ],
  Automotive: [
    {
      area: "车型适配 / 法规",
      riskLevel: "high",
      rule: "不能模糊写通用适配或超出法规要求的性能承诺。",
      whyItMatters: "汽配最容易因 fitment 错误或性能承诺越界被投诉。",
      suggestedAction: "把车型年份、接口规格和限制条件写清楚。",
      evidenceNeeded: "适配清单、规格表、测试数据。",
      watchTerms: ["universal fit", "street legal", "fits all", "guaranteed fit"],
    },
  ],
};

export function checkProhibitedWords(text: string): ProhibitedWordMatch[] {
  const matches: ProhibitedWordMatch[] = [];
  const normalizedText = text.toLowerCase();

  for (const rule of PROHIBITED_WORDS) {
    const regex = new RegExp(`\\b${escapeRegExp(rule.word.toLowerCase())}\\b`, "gi");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(normalizedText)) !== null) {
      matches.push({
        word: rule.word,
        position: match.index,
        context: extractContext(text, match.index, rule.word.length),
        severity: rule.severity,
        reason: rule.reason,
        category: rule.category,
      });
    }
  }

  return matches;
}

export function checkFieldCompliance(
  field: ComplianceField,
  content: string | string[]
): { passed: boolean; violations: ProhibitedWordMatch[] } {
  const text = Array.isArray(content) ? content.join(" ") : content;
  const violations = [
    ...checkProhibitedWords(text),
    ...checkFieldSpecificRules(field, content),
  ];

  return {
    passed: violations.length === 0,
    violations,
  };
}

export function buildCompliancePlaybook(
  productCategory: string,
  version: ListingVersion
): CompliancePlaybookItem[] {
  const rules = [
    ...buildGenericPlaybook(version),
    ...(CATEGORY_RULES[productCategory] ?? []),
  ];
  const combinedText = [
    version.title,
    version.bulletPoints.join(" "),
    version.description,
    version.searchTerms,
  ]
    .join(" ")
    .toLowerCase();

  return rules.map((rule) => {
    const triggeredExamples = rule.watchTerms.filter((term) =>
      combinedText.includes(term.toLowerCase())
    );

    return {
      area: rule.area,
      riskLevel: rule.riskLevel,
      rule: rule.rule,
      whyItMatters: rule.whyItMatters,
      suggestedAction: rule.suggestedAction,
      evidenceNeeded: rule.evidenceNeeded,
      watchTerms: rule.watchTerms,
      triggered: triggeredExamples.length > 0,
      triggeredExamples,
    };
  });
}

function checkFieldSpecificRules(
  field: ComplianceField,
  content: string | string[]
): ProhibitedWordMatch[] {
  const violations: ProhibitedWordMatch[] = [];
  const text = Array.isArray(content) ? content.join(" ") : content;

  if (field === "title") {
    if (text.length > TITLE_LIMIT) {
      violations.push({
        word: `${text.length} chars`,
        position: TITLE_LIMIT,
        context: extractContext(text, TITLE_LIMIT, 16),
        severity: "high",
        reason: `标题超过 ${TITLE_LIMIT} 字符限制。`,
        category: "字段限制",
      });
    }

    const specialCharacterMatch = text.match(TITLE_SPECIAL_CHARACTERS);
    if (specialCharacterMatch) {
      specialCharacterMatch.forEach((character) => {
        const position = text.indexOf(character);
        violations.push({
          word: character,
          position,
          context: extractContext(text, position, 1),
          severity: "medium",
          reason: "标题中包含高风险特殊字符，建议改成自然语言表达。",
          category: "标题格式",
        });
      });
    }

    repeatedWordViolations(text).forEach((item) => violations.push(item));
  }

  if (field === "searchTerms" && utf8ByteLength(text) > SEARCH_TERM_BYTE_LIMIT) {
    violations.push({
      word: `${utf8ByteLength(text)} bytes`,
      position: text.length,
      context: extractContext(text, Math.max(0, text.length - 20), 20),
      severity: "high",
      reason: `Search Terms 超过 ${SEARCH_TERM_BYTE_LIMIT} bytes。`,
      category: "字段限制",
    });
  }

  if (
    (field === "bulletPoints" || field === "description") &&
    /\b(money back|lifetime guarantee|refund guaranteed)\b/i.test(text)
  ) {
    const match = /\b(money back|lifetime guarantee|refund guaranteed)\b/i.exec(text);
    if (match) {
      violations.push({
        word: match[0],
        position: match.index,
        context: extractContext(text, match.index, match[0].length),
        severity: "medium",
        reason: "售后承诺要和真实政策严格一致，建议不要写成强承诺文案。",
        category: "售后声明",
      });
    }
  }

  return violations;
}

function buildGenericPlaybook(version: ListingVersion): CategoryRule[] {
  return [
    {
      area: "标题规范",
      riskLevel: "medium",
      rule: "标题控制在 200 字符内，避免重复词和特殊字符堆砌。",
      whyItMatters: "标题是流量入口，也是最容易踩 Amazon 文本规则的字段。",
      suggestedAction: "优先放类目词、差异点和核心属性，不要塞促销词。",
      evidenceNeeded: "标题字符长度和词频自检结果。",
      watchTerms: repeatedWords(version.title),
    },
    {
      area: "Search Terms",
      riskLevel: "medium",
      rule: "Search Terms 控制在 250 bytes 内，避免堆砌和明显重复。",
      whyItMatters: "后台字段超长或重复堆砌会直接浪费索引空间。",
      suggestedAction: "放长尾补充词、错拼词和前台没写全的相关词。",
      evidenceNeeded: "后台搜索词 bytes 长度检查。",
      watchTerms: version.searchTerms
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8),
    },
    {
      area: "素材协同",
      riskLevel: "low",
      rule: "文字里承诺的卖点，需要在图片、A+ 或视频里看到证据。",
      whyItMatters: "用户顾虑往往不是文字没写，而是没有证据承接。",
      suggestedAction: "把标题主承诺和 Bullet 1-2 对应到主图 / 副图 / A+ 模块。",
      evidenceNeeded: "主图、A+、视频素材清单。",
      watchTerms: version.bulletPoints.slice(0, 3).flatMap((line) => topTerms(line, 3)),
    },
  ];
}

function repeatedWordViolations(text: string): ProhibitedWordMatch[] {
  return repeatedWords(text).map((word) => {
    const position = text.toLowerCase().indexOf(word.toLowerCase());
    return {
      word,
      position,
      context: extractContext(text, position, word.length),
      severity: "medium" as PriorityLevel,
      reason: "标题中同一核心词重复超过 2 次，建议收敛重复堆词。",
      category: "标题重复词",
    };
  });
}

function repeatedWords(text: string): string[] {
  const counts = new Map<string, number>();

  for (const token of text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 1 && !GENERIC_STOP_WORDS.has(item))) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 2)
    .map(([word]) => word);
}

function topTerms(text: string, limit: number): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 2 && !GENERIC_STOP_WORDS.has(item))
    .slice(0, limit);
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function extractContext(text: string, position: number, length: number): string {
  const start = Math.max(0, position - 20);
  const end = Math.min(text.length, position + length + 20);
  return `...${text.slice(start, end)}...`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
