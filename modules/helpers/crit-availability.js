// Pure, dependency-free (no imports, no game/settings/DOM access) — safe for headless tests
// AND for import by gm-bridge.js (cycle-safe: this module imports nothing).
export function availFor(stamp, currentDay) {
  if (stamp === null || stamp === undefined) return { attemptable: true, daysLeft: 0 };
  const s = Math.floor(Number(stamp));
  return { attemptable: currentDay >= s + 7, daysLeft: Math.min(7, Math.max(0, s + 7 - currentDay)) };
}

// system = item.system; currentDay = floored campaignDay; vehicleLimit/canSelfHeal resolved by the caller.
export function computeCritAvailability(system, currentDay, vehicleLimit, canSelfHeal) {
  const sys = system ?? {};
  const resStamp = sys.resilienceLastAttemptDay ?? sys.receivedDay ?? null;
  return {
    resilience: { ...availFor(resStamp, currentDay), canSelfHeal: !!canSelfHeal },
    medicine: availFor(sys.medicineLastAttemptDay ?? null, currentDay),
    mechanics: vehicleLimit ? availFor(sys.mechanicsLastAttemptDay ?? null, currentDay) : null,
  };
}
