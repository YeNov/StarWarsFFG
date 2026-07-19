// Pure, dependency-free (no imports, no game/settings/DOM access) — safe for headless tests
// AND for import by gm-bridge.js (cycle-safe: this module imports nothing).
export function availFor(stamp, currentDay) {
  if (stamp === null || stamp === undefined) return { attemptable: true, daysLeft: 0 };
  const s = Math.floor(Number(stamp));
  return { attemptable: currentDay >= s + 7, daysLeft: Math.min(7, Math.max(0, s + 7 - currentDay)) };
}

// A 7-segment cooldown track: one pip per day of the week, the first `7 - daysLeft`
// (days already elapsed since the attempt) filled. Renders as the codex wounds/strain
// style pip bar. NOT added to availFor()'s return (its shape is asserted in tests).
export function cooldownPips(daysLeft) {
  const passed = 7 - (Number(daysLeft) || 0);
  return Array.from({ length: 7 }, (_, i) => i < passed);
}

// system = item.system; currentDay = floored campaignDay; vehicleLimit/canSelfHeal resolved by the caller.
export function computeCritAvailability(system, currentDay, vehicleLimit, canSelfHeal) {
  const sys = system ?? {};
  const resStamp = sys.resilienceLastAttemptDay ?? sys.receivedDay ?? null;
  const withPips = (a) => ({ ...a, pips: cooldownPips(a.daysLeft) });
  return {
    resilience: { ...withPips(availFor(resStamp, currentDay)), canSelfHeal: !!canSelfHeal },
    medicine: withPips(availFor(sys.medicineLastAttemptDay ?? null, currentDay)),
    mechanics: vehicleLimit ? withPips(availFor(sys.mechanicsLastAttemptDay ?? null, currentDay)) : null,
  };
}
