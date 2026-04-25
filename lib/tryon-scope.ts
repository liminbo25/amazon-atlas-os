export type TryOnGarmentScope = "upper" | "lower" | "full";

export type FashnTryOnCategory = "tops" | "bottoms" | "one-pieces";

export interface TryOnGarmentScopeOption {
  value: TryOnGarmentScope;
  label: string;
  shortLabel: string;
  description: string;
  fashnCategory: FashnTryOnCategory;
  promptTitle: string;
  targetRegion: string;
  preserveRegion: string;
  boundaryInstruction: string;
}

export const DEFAULT_TRY_ON_GARMENT_SCOPE: TryOnGarmentScope = "upper";

export const TRY_ON_GARMENT_SCOPE_OPTIONS: TryOnGarmentScopeOption[] = [
  {
    value: "upper",
    label: "上衣",
    shortLabel: "上衣",
    description: "只替换上半身服装；裤子、裙子、腿部和鞋保持原图不变。",
    fashnCategory: "tops",
    promptTitle: "UPPER BODY / TOP ONLY",
    targetRegion:
      "the upper-body garment area only: neckline, shoulders, chest, torso, sleeves, cuffs, upper arms, and any jacket/top layers above the waist",
    preserveRegion:
      "all lower-body clothing, waistband/belt, pants, skirt, shorts, legs, socks, shoes, floor contact, face, hair, hands, skin, body shape, pose, background, and accessories outside the top",
    boundaryInstruction:
      "Replace only the top/upper-body garment. Keep the original pants, skirt, shorts, legs, shoes, and lower-body silhouette pixel-consistent except for tiny natural overlap shadows at the waist or sleeve contact points.",
  },
  {
    value: "lower",
    label: "下装",
    shortLabel: "下装",
    description: "只替换腰部以下服装；上衣、脸、头发、手臂保持原图不变。",
    fashnCategory: "bottoms",
    promptTitle: "LOWER BODY / BOTTOM ONLY",
    targetRegion:
      "the lower-body garment area only: waistline, hips, pelvis, legs covered by pants, skirt, shorts, trousers, leggings, or similar bottoms",
    preserveRegion:
      "the upper-body garment, neckline, shoulders, torso, sleeves, arms, hands, face, hair, skin, body shape, pose, shoes unless physically covered by the bottom garment, background, and accessories outside the bottom",
    boundaryInstruction:
      "Replace only the lower-body garment. Keep the original top, sleeves, torso, arms, hands, face, hair, and shoes unchanged except for tiny natural overlap shadows at the waistband or hem.",
  },
  {
    value: "full",
    label: "全身",
    shortLabel: "全身",
    description: "替换整套可见服装；人物身份、身材、姿势、背景仍保持原图。",
    fashnCategory: "one-pieces",
    promptTitle: "FULL OUTFIT / WHOLE VISIBLE CLOTHING",
    targetRegion:
      "all visible clothing worn by the person, including top and bottom garments or one-piece garments such as dresses, jumpsuits, robes, coordinated sets, and full outfits",
    preserveRegion:
      "face identity, facial features, expression, hairstyle, skin tone, body shape, pose, hands, bare skin, camera angle, crop, perspective, lighting, shadows, background, and non-garment accessories unless the garment reference explicitly includes matching accessories",
    boundaryInstruction:
      "Replace the visible outfit only. Do not regenerate the person, pose, body proportions, face, hair, hands, bare skin, background, camera angle, or scene.",
  },
];

export function normalizeTryOnGarmentScope(
  rawValue?: string | null
): TryOnGarmentScope {
  return TRY_ON_GARMENT_SCOPE_OPTIONS.some((option) => option.value === rawValue)
    ? (rawValue as TryOnGarmentScope)
    : DEFAULT_TRY_ON_GARMENT_SCOPE;
}

export function getTryOnGarmentScopeOption(
  scope: TryOnGarmentScope
): TryOnGarmentScopeOption {
  return (
    TRY_ON_GARMENT_SCOPE_OPTIONS.find((option) => option.value === scope) ||
    TRY_ON_GARMENT_SCOPE_OPTIONS[0]
  );
}
