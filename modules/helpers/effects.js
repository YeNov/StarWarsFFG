export default class EffectHelpers {

  // Lookup mode name from int
  static MODES = Object.fromEntries(
    Object.entries(CONST.ACTIVE_EFFECT_MODES).map(
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

    // Convert duration to string
    if (effect.duration.combat) {
      effect.duration = game.i18n.localize("SWFFG.Effect.Duration.CurrentCombat");
    } else if (effect.duration.seconds) {
      effect.duration = `${effect.duration.seconds} ${game.i18n.localize("SWFFG.Effect.Duration.Seconds")}`;
    } else if (effect.duration.rounds) {
      effect.duration = `${effect.duration.rounds} ${game.i18n.localize("SWFFG.Effect.Duration.Rounds")}`;
    } else if (effect.duration.turns) {
      effect.duration = `${effect.duration.turns} ${game.i18n.localize("SWFFG.Effect.Duration.Turns")}`;
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