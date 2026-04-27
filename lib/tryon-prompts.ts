import {
  DEFAULT_TRY_ON_GARMENT_SCOPE,
  getTryOnGarmentScopeOption,
  normalizeTryOnGarmentScope,
  type TryOnGarmentScope,
} from "@/lib/tryon-scope";

export const TRY_ON_CHAT_IMAGE_LABELS = [
  "Image 1: garment reference only. Copy only the visible garment design. Ignore this image's room, wall, floor, hanger, mannequin, rack, mirror, props, lighting, and background.",
  "Image 2: locked base photo and the only allowed source for the person, pose, camera, lighting, shadows, crop, aspect ratio, and background. Preserve its scene exactly.",
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

ABSOLUTE SCENE LOCK:
5. The final image must be an edited copy of Image 2, not a new image inspired by both inputs.
6. Keep Image 2's background exactly as the only background source. Preserve the same wall, floor, furniture, room, studio backdrop, props, crop, aspect ratio, camera angle, perspective, lighting direction, and shadows.
7. Never copy, blend, or borrow Image 1's background, room, wall, floor, hanger, clothing rack, mannequin, mirror, props, camera angle, or lighting.
8. If Image 1 shows a store, closet, dressing room, hanger, mannequin, display rack, mirror, or product-photo setup, treat all of that as forbidden context. Only the garment itself may transfer.

GARMENT FROM IMAGE 1:
9. Preserve the exact garment design: pattern, print, color, texture, logo, trim, stitching, seams, lace, mesh, transparency, layering, neckline, straps, sleeves, hemline, length, silhouette, cut lines, and openings.
10. If the garment includes sheer fabric, mesh, lace, crochet, embroidery, beading, or multi-layer construction, keep those structures visible and separate. Do not simplify them.
11. Fit the garment realistically to the pose and body while preserving fabric drape, wrinkles, tension, thickness, and material behavior.

EDIT BOUNDARY:
12. Modify only the selected scope's clothing region and the minimal contact shadows or occlusion needed for realism.
13. Do not replace, recolor, redesign, or remove clothing outside the selected scope.
14. Do not move the person, change the body outline outside the selected clothing scope, recrop the frame, replace the floor, replace the wall, add studio lighting, or add/remove background objects.
15. If exact transfer is difficult, keep Image 2's person and scene unchanged, and reduce garment fidelity before changing the background, camera, crop, or preserved clothing.

OUTPUT:
Return one realistic virtual try-on edit that looks like Image 2 with only the selected clothing scope changed.${noteText}`;
}
