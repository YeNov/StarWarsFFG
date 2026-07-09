import { AE_MODES } from "../config/ffg-active-effect-modes.js";
export default class EffectHelpers {

  // Lookup mode name from int
  static MODES = Object.fromEntries(
    Object.entries(AE_MODES).map(
      ([key, value]) => [value, key])
    );

  // Map effects from EmbeddedCollection
  static transformEffects(originalEffect, _iterator, _effects) {
    // originalEffect is a live ActiveEffect Document. toObject() gives a plain,
    // mutable copy of most source fields (duration, name, ...). On V14, though,
    // the serialized copy comes back WITHOUT `changes` (structuredClone dropped
    // it the same way), so read the changes off the live effect explicitly and
    // deep-clone them so the mode/key rewrites below don't mutate the document.
    // The `?? []` keeps this from ever throwing if changes are absent.
    let effect = originalEffect.toObject();

    // Copy properties we need from the live document
    effect.id = originalEffect.id;
    effect.parentName = originalEffect.parent.name;
    effect.active = originalEffect.active;
    effect.changes = foundry.utils.deepClone(originalEffect.changes ?? []);

    // Convert duration to a display string.
    //
    // The system tracks its own dice-status lifetimes in flags, NOT in the core
    // ActiveEffect.duration: "once" = consumed on the next check, "combat" = cleared
    // when combat ends. Those statuses leave the core duration unset (permanent), so
    // show the flag lifetime first — otherwise e.g. "Advantage Next Check" reads
    // "Permanent". Read it off the live document (toObject can drop it on V14).
    const ffgDuration = originalEffect.flags?.starwarsffg?.duration ?? effect.flags?.starwarsffg?.duration;
    const d = effect.duration ?? {};
    if (ffgDuration === "once") {
      effect.duration = game.i18n.localize("SWFFG.Effect.Duration.NextCheck");
    } else if (ffgDuration === "combat") {
      effect.duration = game.i18n.localize("SWFFG.Effect.Duration.CurrentCombat");
    }
    // V14 rewrote the core duration model from {seconds, rounds, turns, combat, ...}
    // to {value, units, ...}; the old field reads all came back undefined on V14, so
    // every row showed "Permanent". Handle the V14 {value, units} shape first, then
    // fall back to the legacy V13 fields so timed core durations read correctly on both.
    else if (Number.isInteger(d.value) && d.units) {
      // V14: value + units (seconds/rounds/turns/minutes/hours/days/...). Use the
      // localized label for the units we ship strings for; otherwise show the raw
      // unit name so exotic units still read sensibly.
      const unitKey = { seconds: "Seconds", rounds: "Rounds", turns: "Turns" }[d.units];
      const unitLabel = unitKey ? game.i18n.localize(`SWFFG.Effect.Duration.${unitKey}`) : d.units;
      effect.duration = `${d.value} ${unitLabel}`;
    } else if (d.combat) {
      effect.duration = game.i18n.localize("SWFFG.Effect.Duration.CurrentCombat");
    } else if (d.seconds) {
      effect.duration = `${d.seconds} ${game.i18n.localize("SWFFG.Effect.Duration.Seconds")}`;
    } else if (d.rounds) {
      effect.duration = `${d.rounds} ${game.i18n.localize("SWFFG.Effect.Duration.Rounds")}`;
    } else if (d.turns) {
      effect.duration = `${d.turns} ${game.i18n.localize("SWFFG.Effect.Duration.Turns")}`;
    } else {
      effect.duration = game.i18n.localize("SWFFG.Effect.Duration.Permanent");
    }

    // Update each change from this effect
    effect.changes.forEach((change, index) => {
      // Convert mode to string
      change.mode = EffectHelpers.MODES[change.mode];

      // LStrip 'system.' for shorter keys
      if (change.key.startsWith("system.")) {
        change.key = change.key.substring(7);
      }
    });

    return effect;
  }
}