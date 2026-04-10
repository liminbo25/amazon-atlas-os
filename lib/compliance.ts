// 亚马逊违禁词库和合规检查

export interface ProhibitedWord {
  word: string;
  severity: "high" | "medium" | "low";
  reason: string;
  category: string;
}

// 亚马逊常见违禁词列表
export const PROHIBITED_WORDS: ProhibitedWord[] = [
  // 绝对化用语 (High severity)
  { word: "best", severity: "high", reason: "绝对化声明，违反亚马逊政策", category: "绝对化用语" },
  { word: "best seller", severity: "high", reason: "绝对化声明", category: "绝对化用语" },
  { word: "best quality", severity: "high", reason: "绝对化声明", category: "绝对化用语" },
  { word: "#1", severity: "high", reason: "排名声明", category: "绝对化用语" },
  { word: "number one", severity: "high", reason: "排名声明", category: "绝对化用语" },
  { word: "top rated", severity: "high", reason: "评级声明", category: "绝对化用语" },
  { word: "guaranteed", severity: "high", reason: "保证性声明", category: "绝对化用语" },
  { word: "100% effective", severity: "high", reason: "绝对化效果声明", category: "绝对化用语" },

  // 医疗健康声明 (High severity)
  { word: "cure", severity: "high", reason: "医疗声明，需FDA批准", category: "医疗声明" },
  { word: "treat", severity: "high", reason: "医疗声明", category: "医疗声明" },
  { word: "diagnose", severity: "high", reason: "医疗声明", category: "医疗声明" },
  { word: "prevent disease", severity: "high", reason: "医疗声明", category: "医疗声明" },
  { word: "FDA approved", severity: "high", reason: "需提供FDA证明", category: "认证声明" },
  { word: "clinically proven", severity: "high", reason: "需提供临床证明", category: "认证声明" },

  // 时效性用语 (Medium severity)
  { word: "sale", severity: "medium", reason: "促销用语不应出现在标题", category: "促销用语" },
  { word: "discount", severity: "medium", reason: "促销用语", category: "促销用语" },
  { word: "free shipping", severity: "medium", reason: "促销用语", category: "促销用语" },
  { word: "limited time", severity: "medium", reason: "时效性声明", category: "促销用语" },
  { word: "today only", severity: "medium", reason: "时效性声明", category: "促销用语" },

  // 主观评价 (Low severity)
  { word: "amazing", severity: "low", reason: "主观评价，建议用客观描述", category: "主观用语" },
  { word: "perfect", severity: "low", reason: "主观评价", category: "主观用语" },
  { word: "incredible", severity: "low", reason: "主观评价", category: "主观用语" },

  // 其他违规
  { word: "amazon", severity: "medium", reason: "不应在Listing中提及亚马逊", category: "平台名称" },
  { word: "ebay", severity: "medium", reason: "不应提及竞争平台", category: "平台名称" },
  { word: "warranty", severity: "medium", reason: "保修声明需在产品详情页说明", category: "保修声明" },
];

export interface ProhibitedWordMatch {
  word: string;
  position: number;
  context: string;
  severity: "high" | "medium" | "low";
  reason: string;
  category: string;
}

/**
 * 检查文本中的违禁词
 */
export function checkProhibitedWords(text: string): ProhibitedWordMatch[] {
  const matches: ProhibitedWordMatch[] = [];
  const lowerText = text.toLowerCase();

  for (const prohibited of PROHIBITED_WORDS) {
    const regex = new RegExp(`\\b${prohibited.word.toLowerCase()}\\b`, "gi");
    let match;

    while ((match = regex.exec(lowerText)) !== null) {
      const position = match.index;
      const contextStart = Math.max(0, position - 20);
      const contextEnd = Math.min(text.length, position + prohibited.word.length + 20);
      const context = text.substring(contextStart, contextEnd);

      matches.push({
        word: prohibited.word,
        position,
        context: `...${context}...`,
        severity: prohibited.severity,
        reason: prohibited.reason,
        category: prohibited.category,
      });
    }
  }

  return matches;
}

/**
 * 检查单个字段的合规性
 */
export function checkFieldCompliance(
  field: "title" | "bulletPoints" | "description" | "searchTerms",
  content: string | string[]
): { passed: boolean; violations: ProhibitedWordMatch[] } {
  const textToCheck = Array.isArray(content) ? content.join(" ") : content;
  const violations = checkProhibitedWords(textToCheck);

  return {
    passed: violations.length === 0,
    violations,
  };
}
