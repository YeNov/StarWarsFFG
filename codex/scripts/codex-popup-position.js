/**
 * Place a popup beside an anchor while keeping the popup inside the viewport.
 * Prefer below the anchor; flip above when the lower edge would be clipped.
 */
export function placeCodexPopup(anchor, popup, viewport, { gap = 6, padding = 8 } = {}) {
  const width = Math.max(0, Number(viewport?.width) || 0);
  const height = Math.max(0, Number(viewport?.height) || 0);
  const popupWidth = Math.max(0, Number(popup?.width) || 0);
  const popupHeight = Math.max(0, Number(popup?.height) || 0);

  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
  const centeredLeft = (Number(anchor?.left) || 0) + ((Number(anchor?.width) || 0) - popupWidth) / 2;
  const left = clamp(centeredLeft, padding, width - popupWidth - padding);

  const below = (Number(anchor?.bottom) || 0) + gap;
  const above = (Number(anchor?.top) || 0) - popupHeight - gap;
  const preferredTop = below + popupHeight <= height - padding ? below : above;
  const top = clamp(preferredTop, padding, height - popupHeight - padding);

  return { left, top };
}
