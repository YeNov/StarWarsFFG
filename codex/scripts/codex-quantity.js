/**
 * The count shown in a Codex gear card's QTY stepper. The column has room for four
 * digits between the − and + buttons, so a longer count shows its first three digits
 * and "..", and the card's tooltip carries the full number.
 * @param {number|string} value
 * @returns {string}
 */
export function codexQuantityLabel(value) {
  const text = String(value ?? "");
  return text.length > 4 ? `${text.slice(0, 3)}..` : text;
}
