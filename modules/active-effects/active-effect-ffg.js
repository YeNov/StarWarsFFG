
function disablePushOnItem(options){
  // don't show push/animation if that's an effect from item
  if(options.parent.parentCollection === "items")
  {
    options.animate = false;
  }
}

/**
 * Extend the basic ActiveEffect
 * @extends {ActiveEffect}
 */
export class ActiveEffectFFG extends ActiveEffect {
  /**
   * V14 replaced the core ActiveEffect `duration` model
   * ({seconds, rounds, turns, combat, ...}) with {value, units, expiry}, where
   * `value` must be an integer when `units` is set. This system never uses the
   * core field (it tracks its own duration in `flags.starwarsffg.duration`), so effects
   * routinely carry the invalid default shape {value: null, units: "seconds"}.
   * That shape is tolerated as a schema default, but rejected when supplied
   * explicitly -- which happens any time an effect is copied via toObject() and
   * re-created (item drop, OggDude import, character build, purchase/transfer,
   * _onCreateAEs, ...). It aborts the create with a DataModelValidationError.
   *
   * migrateData runs on every construction, before validation, for every path,
   * so stripping the malformed core duration here fixes them all centrally:
   * Foundry then applies a valid default. Real integer durations are untouched.
   * @override
   */
  static migrateData(source) {
    if (source?.duration && !Number.isInteger(source.duration.value)) {
      delete source.duration;
    }
    return super.migrateData(source);
  }

  /** @override */
  async _onCreate(changed, options, userId) {
    disablePushOnItem(options);
    await super._onCreate(changed, options, userId);
  }

  /** @override */
  async _onUpdate(changed, options, userId) {
    disablePushOnItem(options);
    await super._onUpdate(changed, options, userId);
  }

  /** @override */
  async _onDelete(options, userId) {
    disablePushOnItem(options);
    await super._onDelete(options, userId);
  }
}
