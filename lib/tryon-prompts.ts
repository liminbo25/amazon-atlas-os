export const TRY_ON_CHAT_IMAGE_LABELS = [
  "Image 1: garment reference only. Use this image only to copy the clothing exactly.",
  "Image 2: locked base photo. Preserve this person's identity, pose, hands, legs, hair, skin tone, camera angle, lighting, and background.",
];

export function buildStrictTryOnPrompt(garmentNote?: string) {
  const trimmedNote = garmentNote?.trim();
  const noteText = trimmedNote
    ? `\nADDITIONAL GARMENT NOTE:\n${trimmedNote}`
    : "";

  return `Strict virtual try-on edit.

ROLE OF EACH INPUT:
- Image 1 is the garment reference only.
- Image 2 is the locked base photo of the person and the scene.

GOAL:
Edit image 2 only by replacing the clothing worn by the person with the exact garment from image 1.

LOCK IMAGE 2:
1. Keep the same face identity, facial features, expression, hairstyle, skin tone, body shape, pose, hands, legs, camera angle, crop, perspective, lighting, shadows, background, and non-garment accessories.
2. Do not beautify, restyle, slim, reshape, repaint, or regenerate the person or the scene.
3. Do not turn this into a new fashion shoot, campaign image, or stylized reinterpretation.

GARMENT FROM IMAGE 1:
4. Preserve the exact garment design: pattern, print, color, texture, logo, trim, stitching, seams, lace, mesh, transparency, layering, neckline, straps, sleeves, hemline, length, silhouette, cut lines, and openings.
5. If the garment includes sheer fabric, mesh, lace, crochet, embroidery, beading, or multi-layer construction, keep those structures visible and separate. Do not simplify them.
6. Fit the garment realistically to the pose and body while preserving fabric drape, wrinkles, tension, thickness, and material behavior.

EDIT BOUNDARY:
7. Modify only the clothing region and the minimal contact shadows or occlusion needed for realism.
8. If exact transfer is difficult, keep the person and scene from image 2 unchanged, and preserve garment details from image 1 instead of inventing new clothing details.

OUTPUT:
Return one realistic e-commerce try-on image with high garment fidelity and strong identity preservation.${noteText}`;
}
