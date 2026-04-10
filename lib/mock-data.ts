import type {
  CompetitorListing,
  ReviewData,
  TrafficKeyword,
  PainPoint,
  ValuePoint,
  CompetitorCopyAnalysis,
  ListingVersion,
} from "./types";
import { checkFieldCompliance } from "./compliance";

// ===== 竞品 Listing 数据 =====
export function generateCompetitorListing(asin: string): CompetitorListing {
  const productTypes = [
    { name: "Wireless Earbuds", price: 29.99, rating: 4.3, reviews: 2341 },
    { name: "Bluetooth Headphones", price: 39.99, rating: 4.5, reviews: 1876 },
    { name: "Noise Cancelling Earphones", price: 49.99, rating: 4.2, reviews: 3210 },
  ];

  const idx = parseInt(asin.slice(-2), 16) % productTypes.length;
  const product = productTypes[idx];

  return {
    asin,
    title: `${product.name} - Premium Quality Wireless Bluetooth 5.3 Earbuds with Deep Bass, 40H Playtime, IPX7 Waterproof, Touch Control for iPhone Android`,
    bulletPoints: [
      "【Advanced Bluetooth 5.3 Technology】Latest Bluetooth 5.3 chip ensures stable connection up to 50ft, faster pairing and lower latency for seamless audio experience",
      "【Immersive Sound Quality】13mm dynamic drivers deliver rich bass and crystal clear treble, perfect for music, calls, and gaming",
      "【40 Hours Playtime & Fast Charging】8 hours per charge plus 32 hours from charging case. USB-C quick charge gives 2 hours playtime in just 10 minutes",
      "【IPX7 Waterproof & Comfortable Fit】Nano-coating protects against sweat and rain. 3 sizes of soft ear tips ensure secure fit for workouts and daily use",
      "【Smart Touch Control & Wide Compatibility】Easy touch controls for music, calls, and voice assistant. Works with iPhone, Android, tablets, and laptops",
    ],
    attributes: {
      Brand: "TechAudio",
      Color: "Black",
      Connectivity: "Wireless",
      "Battery Life": "40 Hours",
      "Water Resistance": "IPX7",
    },
    price: product.price,
    rating: product.rating,
    reviews: product.reviews,
    monthlySales: Math.floor(800 + Math.random() * 1200),
    bsr: Math.floor(1000 + Math.random() * 5000),
    mainImage: "",
  };
}

// ===== 评论数据 =====
export function generateReviews(
  asin: string,
  type: "negative" | "positive",
  limit: number = 100
): ReviewData[] {
  const negativeTemplates = [
    { title: "Stopped working after 2 weeks", content: "The left earbud stopped working completely after just 2 weeks of use. Very disappointed with the quality.", rating: 1 },
    { title: "Poor sound quality", content: "Sound is very tinny and lacks bass. Not worth the price at all.", rating: 2 },
    { title: "Uncomfortable fit", content: "These hurt my ears after 30 minutes. The ear tips don't fit well and keep falling out during workouts.", rating: 2 },
    { title: "Connection issues", content: "Constantly disconnects from my phone. Very frustrating when trying to listen to music or take calls.", rating: 1 },
    { title: "Battery dies quickly", content: "Battery life is nowhere near advertised. Lucky to get 4 hours on a charge.", rating: 2 },
    { title: "Cheap plastic feel", content: "Feels very cheap and flimsy. The charging case broke within a month.", rating: 1 },
    { title: "Not waterproof", content: "Got caught in light rain and they stopped working. So much for IPX7 waterproof rating.", rating: 1 },
    { title: "Terrible microphone", content: "People can't hear me on calls. Microphone quality is awful with lots of background noise.", rating: 2 },
    { title: "Doesn't fit in ears", content: "Way too big for my ears. Even the smallest tips don't stay in place.", rating: 2 },
    { title: "Packaging was damaged", content: "Arrived in damaged packaging. Product seems used or refurbished, not new as advertised.", rating: 1 },
  ];

  const positiveTemplates = [
    { title: "Amazing sound quality!", content: "The bass is incredible and the highs are crystal clear. Best earbuds I've owned.", rating: 5 },
    { title: "Great value for money", content: "Can't believe the quality for this price. Rivals brands that cost 3x more.", rating: 5 },
    { title: "Perfect for workouts", content: "Stay in place during intense workouts. Sweat resistant and comfortable for hours.", rating: 5 },
    { title: "Long battery life", content: "Battery lasts all day and the case holds multiple charges. Never run out of power.", rating: 5 },
    { title: "Easy to use", content: "Pairing is instant and touch controls work perfectly. Very intuitive.", rating: 5 },
    { title: "Comfortable fit", content: "Forget I'm wearing them. The ear tips fit perfectly and don't cause any discomfort.", rating: 5 },
    { title: "Great for calls", content: "Microphone quality is excellent. People say I sound clear even in noisy environments.", rating: 5 },
    { title: "Stylish design", content: "Look premium and modern. The charging case is compact and fits easily in my pocket.", rating: 4 },
    { title: "Quick charging", content: "Fast charging is a game changer. 10 minutes gives me enough for my commute.", rating: 5 },
    { title: "Reliable connection", content: "No dropouts or lag. Connection is stable even when my phone is in another room.", rating: 5 },
  ];

  const templates = type === "negative" ? negativeTemplates : positiveTemplates;
  const reviews: ReviewData[] = [];

  for (let i = 0; i < limit; i++) {
    const template = templates[i % templates.length];
    const daysAgo = Math.floor(Math.random() * 180);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    reviews.push({
      id: `${asin}-${type}-${i}`,
      asin,
      rating: template.rating,
      title: template.title,
      content: template.content,
      date: date.toISOString().split("T")[0],
      verifiedPurchase: Math.random() > 0.2,
      helpfulVotes: Math.floor(Math.random() * 50),
    });
  }

  return reviews;
}

// ===== 流量关键词 =====
export function generateTrafficKeywords(): TrafficKeyword[] {
  const keywords = [
    { keyword: "wireless earbuds", searchVolume: 45200, organicRank: 15, sponsoredRank: 3, conversionShare: 0.18 },
    { keyword: "bluetooth earbuds", searchVolume: 38500, organicRank: 22, sponsoredRank: null, conversionShare: 0.12 },
    { keyword: "earbuds wireless bluetooth", searchVolume: 28300, organicRank: 8, sponsoredRank: 1, conversionShare: 0.25 },
    { keyword: "wireless headphones", searchVolume: 52100, organicRank: 45, sponsoredRank: 12, conversionShare: 0.08 },
    { keyword: "noise cancelling earbuds", searchVolume: 19800, organicRank: 31, sponsoredRank: 5, conversionShare: 0.15 },
    { keyword: "workout earbuds", searchVolume: 12400, organicRank: 12, sponsoredRank: null, conversionShare: 0.22 },
    { keyword: "waterproof earbuds", searchVolume: 9600, organicRank: 18, sponsoredRank: 8, conversionShare: 0.19 },
    { keyword: "bluetooth 5.3 earbuds", searchVolume: 6800, organicRank: 5, sponsoredRank: 2, conversionShare: 0.28 },
    { keyword: "long battery earbuds", searchVolume: 5200, organicRank: 9, sponsoredRank: null, conversionShare: 0.21 },
    { keyword: "touch control earbuds", searchVolume: 4100, organicRank: 14, sponsoredRank: 6, conversionShare: 0.17 },
  ];

  return keywords;
}

// ===== VOC 分析 - 痛点提炼 =====
export function generatePainPoints(): PainPoint[] {
  const painPoints: PainPoint[] = [
    {
      rank: 1,
      category: "质量问题",
      frequency: 34,
      percentage: 34,
      typicalQuotes: [
        "Stopped working after 2 weeks",
        "Left earbud died completely",
        "Charging case broke within a month",
      ],
      sellingPointSuggestion: "强调产品耐用性和质量保证，提供18个月质保服务",
    },
    {
      rank: 2,
      category: "使用体验",
      frequency: 28,
      percentage: 28,
      typicalQuotes: [
        "Hurt my ears after 30 minutes",
        "Keep falling out during workouts",
        "Way too big for my ears",
      ],
      sellingPointSuggestion: "突出人体工学设计，提供多种尺寸耳塞，强调舒适度测试",
    },
    {
      rank: 3,
      category: "功能缺陷",
      frequency: 22,
      percentage: 22,
      typicalQuotes: [
        "Battery dies quickly, only 4 hours",
        "Constantly disconnects from phone",
        "Microphone quality is awful",
      ],
      sellingPointSuggestion: "明确标注真实续航时间，强调稳定连接技术和通话降噪功能",
    },
    {
      rank: 4,
      category: "与描述不符",
      frequency: 11,
      percentage: 11,
      typicalQuotes: [
        "Not waterproof as advertised",
        "Sound quality nowhere near described",
        "Battery life is false advertising",
      ],
      sellingPointSuggestion: "提供真实测试数据和认证证书，避免夸大宣传",
    },
    {
      rank: 5,
      category: "包装物流",
      frequency: 5,
      percentage: 5,
      typicalQuotes: [
        "Arrived in damaged packaging",
        "Product seems used or refurbished",
        "Missing accessories",
      ],
      sellingPointSuggestion: "强调全新正品，安全包装，完整配件清单",
    },
  ];

  return painPoints;
}

// ===== VOC 分析 - 好评价值点 =====
export function generateValuePoints(): ValuePoint[] {
  return [
    {
      category: "音质表现",
      frequency: 42,
      percentage: 42,
      typicalQuotes: [
        "Amazing sound quality, incredible bass",
        "Crystal clear highs and deep lows",
        "Rivals brands that cost 3x more",
      ],
      leverageSuggestion: "在标题和五点中突出音质优势，使用'Hi-Fi Sound'、'Deep Bass'等关键词",
    },
    {
      category: "性价比",
      frequency: 38,
      percentage: 38,
      typicalQuotes: [
        "Great value for money",
        "Can't believe the quality for this price",
        "Best budget earbuds",
      ],
      leverageSuggestion: "强调高性价比定位，对比同价位产品的优势",
    },
    {
      category: "续航能力",
      frequency: 35,
      percentage: 35,
      typicalQuotes: [
        "Battery lasts all day",
        "Never run out of power",
        "Fast charging is a game changer",
      ],
      leverageSuggestion: "在五点第一条突出续航时间和快充功能",
    },
    {
      category: "佩戴舒适",
      frequency: 31,
      percentage: 31,
      typicalQuotes: [
        "Forget I'm wearing them",
        "Perfect fit, very comfortable",
        "Stay in place during intense workouts",
      ],
      leverageSuggestion: "强调人体工学设计和运动场景适用性",
    },
    {
      category: "连接稳定",
      frequency: 28,
      percentage: 28,
      typicalQuotes: [
        "No dropouts or lag",
        "Pairing is instant",
        "Stable connection even in another room",
      ],
      leverageSuggestion: "突出蓝牙5.3技术和连接稳定性",
    },
  ];
}

// ===== 竞品文案分析 =====
export function generateCompetitorCopyAnalysis(
  listing: CompetitorListing
): CompetitorCopyAnalysis {
  return {
    asin: listing.asin,
    titleStructure: "品牌词 + 核心关键词 + 技术参数 + 核心卖点 + 使用场景 + 兼容性",
    bulletPointLogic: [
      "第1点：技术优势（蓝牙5.3）",
      "第2点：核心功能（音质）",
      "第3点：续航能力",
      "第4点：防水+舒适度",
      "第5点：操控+兼容性",
    ],
    keywordCoverage: [
      "wireless earbuds",
      "bluetooth 5.3",
      "deep bass",
      "40h playtime",
      "IPX7 waterproof",
      "touch control",
    ],
    strengths: [
      "标题包含核心关键词和技术参数",
      "五点描述逻辑清晰，每点一个核心卖点",
      "使用【】符号突出重点",
    ],
    weaknesses: [
      "标题过长（超过200字符），移动端显示不全",
      "缺少情感化描述，过于技术化",
      "未突出与竞品的差异化优势",
    ],
  };
}

// ===== 生成3版 Listing =====
export function generateThreeListingVersions(): ListingVersion[] {
  return [
    {
      versionName: "专业版",
      style: "技术导向，强调参数和专业性能",
      title: "Wireless Earbuds Bluetooth 5.3 - 40H Playtime HiFi Stereo Sound Earphones with ENC Noise Cancelling Mic, IPX7 Waterproof in Ear Headphones, Touch Control USB-C Fast Charge for Sports Gym Running",
      bulletPoints: [
        "【Advanced Bluetooth 5.3 & Stable Connection】Equipped with latest Bluetooth 5.3 chip for faster pairing, lower latency and more stable connection up to 50ft. Seamless audio experience for music, calls and gaming without dropouts",
        "【Premium HiFi Sound & Deep Bass】13mm dynamic drivers with titanium composite diaphragm deliver rich, immersive sound with powerful bass and crystal-clear treble. Professional-grade audio quality rivals premium brands",
        "【40H Playtime & USB-C Fast Charge】8 hours continuous playback per charge, plus 32 hours from compact charging case. USB-C quick charge provides 2 hours playtime in just 10 minutes. Never worry about battery life",
        "【IPX7 Waterproof & Ergonomic Design】Nano-coating technology protects against sweat, rain and splashes. Lightweight ergonomic design with 3 sizes of soft silicone ear tips ensures secure, comfortable fit for all-day wear and intense workouts",
        "【Smart Touch Control & Universal Compatibility】Intuitive touch sensors for easy control of music, calls, volume and voice assistant. Compatible with iPhone, Android, iPad, tablets, laptops and all Bluetooth devices",
      ],
      description: "Experience premium wireless audio with our advanced Bluetooth 5.3 earbuds. Engineered for audiophiles and active lifestyles, these earbuds combine cutting-edge technology with superior comfort. The 13mm dynamic drivers deliver exceptional sound quality with deep, punchy bass and crisp highs. With 40 hours total playtime and fast charging, you'll never miss a beat. IPX7 waterproof rating means you can push your limits in any weather. Perfect for workouts, commuting, gaming, and everyday use.",
      searchTerms: "wireless earbuds bluetooth 5.3 headphones earphones in ear buds noise cancelling waterproof sports running workout gym bass sound quality long battery life fast charging touch control microphone calls iphone android compatible",
    },
    {
      versionName: "情感版",
      style: "生活化场景，强调用户体验和情感共鸣",
      title: "Wireless Earbuds - Your Perfect Audio Companion for Every Moment | 40H Playtime, Immersive Sound, All-Day Comfort | Bluetooth 5.3 Earphones for Work, Workout, Travel | IPX7 Waterproof Headphones",
      bulletPoints: [
        "【Soundtrack to Your Life】Whether you're crushing your workout, focusing at work, or unwinding after a long day, these earbuds deliver the perfect audio experience. Rich, immersive sound that brings your music to life and makes every moment better",
        "【Forget They're There】Designed for all-day comfort with lightweight ergonomic fit that feels like nothing. Three sizes of ultra-soft ear tips ensure a perfect seal without pressure or fatigue. Wear them for hours and forget you have them on",
        "【Power Through Your Day】40 hours of total playtime means these earbuds keep up with your busiest days. Quick 10-minute charge gives you 2 hours of listening. Start your morning playlist and still have battery for your evening podcast",
        "【Built for Real Life】Sweat through your workout, get caught in the rain, or take them to the beach - IPX7 waterproof protection has you covered. Durable construction that survives your active lifestyle without compromising on style",
        "【Effortlessly Connected】Instant pairing, rock-solid connection, and intuitive touch controls make these earbuds a joy to use. Crystal-clear calls with noise reduction mean you're always heard. Works seamlessly with all your devices",
      ],
      description: "Life sounds better with the right soundtrack. These wireless earbuds are designed to be your constant companion - from your morning run to your evening wind-down. We've obsessed over every detail to create earbuds that sound amazing, feel comfortable, and just work. No complicated setup, no frustrating dropouts, no compromises. Just pure, immersive audio that enhances every moment of your day. Because you deserve audio gear that keeps up with your life.",
      searchTerms: "wireless earbuds comfortable all day bluetooth headphones everyday use lifestyle music lovers workout earphones travel portable long battery waterproof reliable quality sound bass calls microphone easy pairing iphone android",
    },
    {
      versionName: "性价比版",
      style: "突出价值和实用性，强调物超所值",
      title: "Wireless Earbuds Bluetooth 5.3 - Premium Features at Unbeatable Value | 40H Battery, HiFi Sound, IPX7 Waterproof | Best Budget Earphones for iPhone Android | Touch Control, Fast Charging, Comfortable Fit",
      bulletPoints: [
        "【Premium Quality, Smart Price】Why pay more? Get flagship features without the flagship price. Advanced Bluetooth 5.3, HiFi sound quality, and 40-hour battery life - everything you need in wireless earbuds at a price that makes sense",
        "【All the Features You Actually Need】13mm drivers for rich sound, reliable connection, long battery life, waterproof protection, and comfortable fit. No gimmicks, no compromises - just solid performance where it matters most",
        "【40 Hours of Non-Stop Music】8 hours per charge plus 32 hours from the case means you'll charge these less often than your phone. USB-C fast charging adds 2 hours in just 10 minutes. Maximum convenience, minimum hassle",
        "【Workout-Ready & Weather-Proof】IPX7 waterproof rating protects against sweat, rain, and splashes. Secure fit stays put during runs, gym sessions, and active days. Built tough to handle your lifestyle without breaking the bank",
        "【Works With Everything, Easy to Use】Pairs instantly with iPhone, Android, tablets, and laptops. Simple touch controls for music, calls, and voice assistant. Great sound quality for calls with noise reduction. Universal compatibility, zero learning curve",
      ],
      description: "Smart shoppers know that premium features don't require premium prices. These wireless earbuds prove you can have it all - exceptional sound quality, long battery life, waterproof durability, and comfortable fit - without overspending. We've focused on what really matters: reliable performance, great sound, and features you'll actually use every day. No fancy packaging or celebrity endorsements, just honest value and quality you can count on. Perfect for anyone who wants flagship performance at a fraction of the cost.",
      searchTerms: "wireless earbuds budget affordable cheap best value bluetooth headphones under 50 quality sound long battery waterproof reliable durable everyday use workout sports iphone android compatible good reviews recommended",
    },
  ];
}

// ===== 合规检查 =====
export function checkListingCompliance(listing: ListingVersion) {
  return {
    title: checkFieldCompliance("title", listing.title),
    bulletPoints: checkFieldCompliance("bulletPoints", listing.bulletPoints),
    description: checkFieldCompliance("description", listing.description),
    searchTerms: checkFieldCompliance("searchTerms", listing.searchTerms),
  };
}
