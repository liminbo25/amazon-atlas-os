import {
  DEFAULT_TRY_ON_GARMENT_SCOPE,
  getTryOnGarmentScopeOption,
  normalizeTryOnGarmentScope,
  type TryOnGarmentScope,
} from "@/lib/tryon-scope";

export const TRY_ON_CHAT_IMAGE_LABELS = [
  "Image 1: garment reference only. Use this image only to copy the clothing exactly.",
  "Image 2: locked base photo. Preserve this person's identity, pose, hands, legs, hair, skin tone, camera angle, lighting, background, crop, and aspect ratio.",
];

export function buildStrictTryOnPrompt(
  garmentNote?: string,
  garmentScope: TryOnGarmentScope = DEFAULT_TRY_ON_GARMENT_SCOPE
) {
  const trimmedNote = garmentNote?.trim();
  const normalizedScope = normalizeTryOnGarmentScope(garmentScope);
  const scopeOption = getTryOnGarmentScopeOption(normalizedScope);
  const noteText = trimmedNote
    ? `\nADDITIONAL GARMENT NOTE:\n${trimmedNote}`
    : "";

  return `Strict virtual try-on edit.

ROLE OF EACH INPUT:
- Image 1 is the garment reference only.
- Image 2 is the locked base photo of the person and the scene.

GOAL:
Edit image 2 only by replacing the selected clothing scope with the exact garment from image 1.

LOCK IMAGE 2:
1. Keep the same face identity, facial features, expression, hairstyle, skin tone, body shape, pose, hands, legs, camera angle, crop, perspective, lighting, shadows, background, and non-garment accessories.
2. Do not beautify, restyle, slim, reshape, repaint, or regenerate the person or the scene.
3. Do not turn this into a new fashion shoot, campaign image, or stylized reinterpretation.
4. Keep the output canvas, crop, framing, and aspect ratio the same as image 2. Do not force a square crop, portrait crop, landscape crop, zoom-in, or zoom-out.

SELECTED TRY-ON SCOPE:
- Scope: ${scopeOption.promptTitle}.
- Target region: ${scopeOption.targetRegion}.
- Locked / preserved region: ${scopeOption.preserveRegion}.
- Boundary rule: ${scopeOption.boundaryInstruction}
- If image 1 contains garments outside the selected scope, ignore those extra garments and do not apply them to image 2.
- If the selected scope is ambiguous, choose the smaller matching garment region instead of expanding the edit to the whole body.

GARMENT FROM IMAGE 1:
5. Preserve the exact garment design: pattern, print, color, texture, logo, trim, stitching, seams, lace, mesh, transparency, layering, neckline, straps, sleeves, hemline, length, silhouette, cut lines, and openings.
6. If the garment includes sheer fabric, mesh, lace, crochet, embroidery, beading, or multi-layer construction, keep those structures visible and separate. Do not simplify them.
7. Fit the garment realistically to the pose and body while preserving fabric drape, wrinkles, tension, thickness, and material behavior.

EDIT BOUNDARY:
8. Modify only the selected scope's clothing region and the minimal contact shadows or occlusion needed for realism.
9. If exact transfer is difficult, keep the person and scene from image 2 unchanged, and preserve garment details from image 1 instead of inventing new clothing details.
10. Do not replace, recolor, redesign, or remove clothing outside the selected scope.

OUTPUT:
Return one realistic e-commerce try-on image with high garment fidelity and strong identity preservation.${noteText}`;
}
