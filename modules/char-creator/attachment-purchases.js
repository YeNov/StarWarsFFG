/**
 * Attachment purchase helpers for the PC wizard.
 *
 * Attachments are not top-level actor items in this system. They are plain item
 * snapshots nested in `parent.system.itemattachment[]`, so credit purchases use a
 * stable purchase id as the attachment target.
 */

function normalizeType(type) {
  const value = String(type ?? "").toLowerCase();
  if (value === "armor") return "armour";
  return value;
}

export function hardpointValue(refOrSource) {
  const hp = refOrSource?.snapshot?.system?.hardpoints ?? refOrSource?.system?.hardpoints;
  const adjusted = Number(hp?.adjusted);
  if (Number.isFinite(adjusted) && adjusted > 0) return adjusted;
  const value = Number(hp?.value);
  return Number.isFinite(value) ? value : 0;
}

export function attachmentTargetType(ref) {
  return normalizeType(ref?.type);
}

export function attachmentType(ref) {
  return normalizeType(ref?.snapshot?.system?.type);
}

export function isAttachmentPurchase(purchase) {
  return purchase?.ref?.type === "itemattachment" && Boolean(purchase.attachTo);
}

export function isAttachablePurchase(purchase) {
  const type = attachmentTargetType(purchase?.ref);
  return ["weapon", "armour", "gear"].includes(type) && hardpointValue(purchase?.ref) > 0;
}

export function attachmentAppliesTo(targetRef, attachmentRef) {
  const type = attachmentType(attachmentRef);
  const targetType = attachmentTargetType(targetRef);
  return type === "all" || type === targetType;
}

export function attachmentHardpoints(ref) {
  return hardpointValue(ref);
}

export function attachedTo(data, targetId) {
  return (data.purchases?.credits ?? []).filter((purchase) => purchase.attachTo === targetId);
}

export function usedHardpoints(data, targetId) {
  return attachedTo(data, targetId).reduce((sum, purchase) => sum + attachmentHardpoints(purchase.ref), 0);
}

export function remainingHardpoints(data, targetPurchase) {
  return Math.max(0, hardpointValue(targetPurchase?.ref) - usedHardpoints(data, targetPurchase?.id));
}

export function canAttach(data, targetPurchase, attachmentRef) {
  return Boolean(targetPurchase?.id)
    && isAttachablePurchase(targetPurchase)
    && attachmentRef?.type === "itemattachment"
    && attachmentAppliesTo(targetPurchase.ref, attachmentRef)
    && attachmentHardpoints(attachmentRef) <= remainingHardpoints(data, targetPurchase);
}

export function attachmentPurchasesByTarget(data) {
  const map = new Map();
  for (const purchase of data.purchases?.credits ?? []) {
    if (!isAttachmentPurchase(purchase)) continue;
    if (!map.has(purchase.attachTo)) map.set(purchase.attachTo, []);
    map.get(purchase.attachTo).push(purchase);
  }
  return map;
}
