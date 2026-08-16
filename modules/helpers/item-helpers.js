import { AE_MODES } from "../config/ffg-active-effect-modes.js";
import ModifierHelpers from "./modifiers.js";

export default class ItemHelpers {
  static async itemUpdate(event, formData, { render = false } = {}) {
    formData = foundry.utils.expandObject(formData);

    if (this.object.isEmbedded && this.object.actor?.compendium?.metadata) {
      return;
    }
    CONFIG.logger.debug(`Updating ${this.object.type}`);

    // Handle the free-form attributes list
    const formAttrs = foundry.utils.expandObject(formData)?.data?.attributes || {};
    const attributes = Object.values(formAttrs).reduce((obj, v) => {
      let k = v["key"].trim();
      delete v["key"];
      obj[k] = v;
      return obj;
    }, {});

    // Remove attributes which are no longer used
    if (this.object.system?.attributes) {
      for (let k of Object.keys(this.object.system.attributes)) {
        if (!attributes.hasOwnProperty(k)) attributes[`-=${k}`] = null;
      }
    }

    // apply active effects
    await ModifierHelpers.applyActiveEffectOnUpdate(this.object, formData);

    // recombine attributes to formData
    if (Object.keys(attributes).length > 0) {
      foundry.utils.setProperty(formData, `data.attributes`, attributes);
    }

    // migrate data to v10 structure
    let updated_id = formData._id;
    delete formData._id;

    foundry.utils.setProperty(formData, `flags.starwarsffg.loaded`, false);
    await this.object.update(formData, { render });
    // sync the active effect state (if applicable). needs to be after the update so we have the updated state
    await ItemHelpers.syncAEStatus(this.object, this.object.getEmbeddedCollection("ActiveEffect"));
    // Gate the explicit sheet re-render on the render flag. With the auto-
    // render hook suppressed (render: false from the change pipeline), an
    // unconditional this.render(true) here would re-introduce the mid-
    // interaction DOM swap that the render-race fix removes. Structural and
    // editor-save flows pass render: true to get the redraw they need.
    if (render) await this.render(true);

    // `render: false` on the update above suppresses every sheet render
    // triggered by Foundry's updateItem hook -- including the parent actor
    // sheet's. That's correct for THIS item's sheet (avoids mid-edit DOM
    // swaps) but the owning actor's sheet shows derived data (weapon rolls,
    // talent panels, etc.) that goes stale until the actor sheet is closed
    // and reopened. Explicitly re-render the actor sheet here when the
    // edited item is embedded; the sheet's own coalesce/race guards already
    // handle the case where the user hasn't opened it.
    if (this.object.isEmbedded && this.object.actor?.sheet?.rendered) {
      this.object.actor.sheet.render(false);
    }

    if (this.object.type === "talent") {
      if (this.object.flags?.clickfromparent?.length) {
        let listofparents = JSON.parse(JSON.stringify(this.object.flags.clickfromparent));
        while (listofparents.length > 0) {
          const parent = listofparents.shift();
          const spec = await fromUuid(parent.id);
          if (spec) {
            let updateData = {};
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.name`, formData.name);
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.description`, this.object.system.description);
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.activation`, formData.data.activation.value);
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.isRanked`, formData.data.ranks.ranked);
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.isForceTalent`, formData.data.isForceTalent);
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.isConflictTalent`, formData.data.isConflictTalent);

            // Remove attributes which are no longer used
            if (spec?.system?.talents?.[parent.talent]?.attributes) {
              for (let k of Object.keys(spec.system.talents[parent.talent].attributes)) {
                if (!formData.data.attributes.hasOwnProperty(k)) formData.data.attributes[`-=${k}`] = null;
              }
            }

            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.attributes`, formData.data.attributes);

            if (parent.id.includes(".OwnedItem.")) {
              const ids = parent.id.split(".OwnedItem.");
              const actor = await fromUuid(ids[0]);
              const item = await actor.items.get(ids[1]);
              foundry.utils.setProperty(updateData, `flags.starwarsffg.loaded`, false);
              await item.update(updateData);
              await item.sheet.render(true);
            } else {
              foundry.utils.setProperty(updateData, `flags.starwarsffg.loaded`, false);
              await spec.update(updateData);
              await spec.sheet.render(true);
            }
          }
        }
      }
    } else if (this.object.type === "career") {
      // apply career skills from Careers
      const existingEffects = this.object.getEmbeddedCollection("ActiveEffect");
      const itemEffect = existingEffects.find(i => i.name === `(inherent)`);
      const changes = [];
      for (let i = 0; i < 8; i++) {
        let path;
        const skill = formData.data.careerSkills[`careerSkill${i}`];
        if (skill !== "(none)") {
          path = `system.skills.${skill}.careerskill`;
        } else {
          path = "(none)";
        }
        changes.push({
          key: path,
          mode: AE_MODES.ADD,
          value: true,
        });
      }
      if (itemEffect) {
        await itemEffect.update({changes: changes});
      }
    } else if (this.object.type === "specialization") {
      // apply career skills from Careers
      const existingEffects = this.object.getEmbeddedCollection("ActiveEffect");
      const itemEffect = existingEffects.find(i => i.name === `(inherent)`);
      const changes = [];
      for (let i = 0; i < 5; i++) {
        let path;
        const skill = formData.data.careerSkills[`careerSkill${i}`];
        if (skill !== "(none)") {
          path = `system.skills.${skill}.careerskill`;
        } else {
          path = "(none)";
        }
        changes.push({
          key: path,
          mode: AE_MODES.ADD,
          value: true,
        });
      }
      if (itemEffect) {
        await itemEffect.update({changes: changes});
      }
    }
  }

  /**
   * Takes formData and move anything under .data into .system in preparation for an item.update() call
   * @param formData
   * @returns {*}
   */
  static normalizeDataStructure(formData) {
    const updatedData = foundry.utils.deepClone(formData);
    if (Object.keys(formData).includes('data')) {
      if (!Object.keys(formData).includes('system')) {
        // sometimes we get formData with a mix of data and system...
        updatedData.system = {};
      }
      updatedData.system = foundry.utils.mergeObject(
          updatedData.system,
          updatedData.data
      );
      delete updatedData.data;
    }
    // Initialize updatedData.system if the key is present with no value
    if (Object.keys(updatedData).includes('system') && typeof updatedData.system === "undefined")
      {
        updatedData.system = {};
      }
    return updatedData;
  }

  /**
   * Takes formData and converts certain fields into an array, rather than the odd name they have by default
   * For example, submitting a form with a modifier on it results in a field value of "itemmodifier[0]", rather than
   *  a field named "itemmodifier" with a single entry in an array
   * @param formData
   */
  static explodeFormData(formData) {
    // convert the formdata into a dict
    formData = foundry.utils.expandObject(formData);
    // collapse the resulting entries with an index into an array
    const relevantEntries = Object.keys(formData?.system).filter(i => i.includes("[") && i.includes("]"));
    for (const cur_entry in relevantEntries) {
      const updatedKeyName =  relevantEntries[cur_entry].replace(/\[.*\]/, "");
      if (!Object.keys(formData.system).includes(updatedKeyName)) {
        formData.system[updatedKeyName] = [];
      }
      formData.system[updatedKeyName].push(formData.system[relevantEntries[cur_entry]]);
      delete formData.system[relevantEntries[cur_entry]];
    }
    return formData;
  }

  /**
   * Item types whose Active Effects are wholly derived from their attributes / qualities,
   * and which `reconcileModifierEffects` is therefore allowed to rebuild.
   */
  static get RECONCILABLE_TYPES() {
    return ["weapon", "armour", "shipweapon", "itemattachment"];
  }

  /**
   * True for Active Effect names this system generates for attribute-derived modifiers.
   *
   * Attribute keys are minted as `attr<timestamp>` (see `uniqueAttrs`), and the reconciler
   * appends `_<n>` when two qualities collide on one key. Anything else -- `(inherent)`,
   * the `Brawn`-style inherent species keys, or an effect the user added by hand through
   * Foundry's own Active Effect config -- is off limits: the reconciler must never delete
   * an effect it did not create.
   *
   * @param {string} name
   * @returns {boolean}
   */
  static isSystemEffectName(name) {
    return /^attr\d+(?:_\d+)?$/.test(String(name ?? ""));
  }

  /**
   * Compute the complete set of Active Effects an item *should* have, derived from its own
   * attributes plus every quality on it (directly, or through an attachment).
   *
   * This is the single source of truth the incremental patch-in-six-places approach never
   * had. It is deliberately pure -- plain data in, a plan out, no document access -- both so
   * it can be unit tested and so a caller can diff before writing.
   *
   * Guarantees, each of which corresponds to a way live worlds got corrupted:
   *   - a change is only emitted when `getModKeyPath` yields a real key (no keyless changes)
   *   - a value is only emitted when it is finite (no `NaN` poisoning the actor's stat)
   *   - two qualities sharing one attribute key get distinct effects, and the collision is
   *     reported in `renames` so the caller can settle it on the item data
   *
   * @param {object} itemData - an ItemFFG or equivalent plain data `{type, system}`
   * @returns {{
   *   desired: Array<{name: string, changes: Array<object>, disabled: boolean}>,
   *   ownedNames: Set<string>,
   *   renames: Array<{path: Array<string|number>, from: string, to: string}>,
   *   warnings: Array<{code: string, name: string, source: string, detail: string}>
   * }}
   */
  static planModifierEffects(itemData) {
    const system = itemData?.system ?? {};
    const equippable = system.equippable;
    // a non-equippable item (an attachment, a bare world weapon template) is never suspended
    const baseDisabled = equippable ? !equippable.equipped : false;

    const desired = [];
    const ownedNames = new Set();
    const renames = [];
    const warnings = [];
    const claimed = new Set();

    // The first claimant of an attribute key keeps it, so effects already named after that
    // key stay matched; later claimants are suffixed deterministically. Determinism matters:
    // reconciliation runs repeatedly and must converge rather than churn new names each pass.
    const claim = (key, path) => {
      if (!claimed.has(key)) {
        claimed.add(key);
        return key;
      }
      let suffix = 2;
      while (claimed.has(`${key}_${suffix}`)) suffix += 1;
      const renamed = `${key}_${suffix}`;
      claimed.add(renamed);
      renames.push({ path, from: key, to: renamed });
      return renamed;
    };

    const addAttributes = (attributes, { ranks, path, disabled, source }) => {
      for (const rawKey of Object.keys(attributes ?? {})) {
        // `-=key` deletion markers are update syntax, not attributes
        if (rawKey.startsWith("-=")) continue;
        const attr = attributes[rawKey];
        if (!attr || typeof attr !== "object") continue;

        const name = claim(rawKey, path);
        // claimed before validation: an attribute the item genuinely carries is "owned" even
        // when it yields no Active Effect, which is what keeps it from looking like an orphan
        ownedNames.add(name);

        // Only `attr<n>` keys are ours to manage. Inherent keys (`Brawn`, `Soak`, and the
        // hand-authored names an imported item can carry) are owned by the `(inherent)`
        // effect and by applyActiveEffectOnUpdate, which likewise only creates effects for
        // `attr`-prefixed keys. Planning them here would mint a duplicate grant.
        if (!ItemHelpers.isSystemEffectName(name)) continue;

        if (attr.modtype === undefined || attr.mod === undefined) {
          warnings.push({ code: "incomplete-attribute", name, source, detail: "" });
          continue;
        }

        // Checkbox / boolean grants (career skills, flags) are switches, not amounts -- a
        // rank-3 quality does not grant a career skill three times.
        let value;
        if (typeof attr.value === "boolean" || attr.isCheckbox === true) {
          value = String(attr.value);
        } else {
          const numeric = Number(attr.value);
          if (!Number.isFinite(numeric)) {
            warnings.push({ code: "bad-value", name, source, detail: String(attr.value) });
            continue;
          }
          value = String(numeric * ranks);
        }

        const changes = [];
        for (const curMod of ModifierHelpers.explodeMod(attr.modtype, attr.mod)) {
          const key = ModifierHelpers.getModKeyPath(curMod["modType"], curMod["mod"]);
          if (!key) {
            // NOT necessarily an error. Plenty of legitimate modifier types have no actor
            // stat to target and are applied by other subsystems entirely -- `Weapon Stat`
            // damage/crit through ItemFFG.prepareData, and the Roll/Result modifiers (boost,
            // setback, advantage) through the dice pool builder. Recording rather than
            // emitting keeps a keyless change out of the database; the *effect* such an
            // attribute may already own is deliberately left alone by the reconciler.
            warnings.push({ code: "no-key", name, source, detail: `${curMod["modType"]}/${curMod["mod"]}` });
            continue;
          }
          changes.push({ key, mode: AE_MODES.ADD, value });
        }
        if (!changes.length) continue;

        desired.push({ name, changes, disabled });
      }
    };

    // A quality applies once per source rank. `rank_current` is presentation-only: prepareData
    // aggregates same-named direct and attachment qualities into it for the summarized UI. The
    // planner walks those sources separately, so using the aggregate here counts attachments
    // once in `rank_current` and again when their own attributes are visited below.
    const ranksOf = (modifier, source) => {
      const raw = modifier?.system?.rank;
      const ranks = Number(raw);
      if (raw === undefined || raw === null || raw === "" || !Number.isFinite(ranks)) {
        warnings.push({ code: "bad-rank", name: modifier?.name ?? "", source, detail: String(raw) });
        return 1;
      }
      return ranks;
    };

    // 1. the item's own attributes -- these claim their keys first
    addAttributes(system.attributes, {
      ranks: 1,
      path: ["attributes"],
      disabled: baseDisabled,
      source: itemData?.name ?? "",
    });

    // 2. qualities applied directly to the item
    const modifiers = Array.isArray(system.itemmodifier) ? system.itemmodifier : [];
    modifiers.forEach((modifier, index) => {
      addAttributes(modifier?.system?.attributes, {
        ranks: ranksOf(modifier, modifier?.name ?? ""),
        path: ["itemmodifier", index],
        disabled: baseDisabled,
        source: modifier?.name ?? "",
      });
    });

    // 3. attachments, and the qualities installed into them
    const attachments = Array.isArray(system.itemattachment) ? system.itemattachment : [];
    attachments.forEach((attachment, attachmentIndex) => {
      addAttributes(attachment?.system?.attributes, {
        ranks: 1,
        path: ["itemattachment", attachmentIndex],
        disabled: baseDisabled,
        source: attachment?.name ?? "",
      });

      const installed = Array.isArray(attachment?.system?.itemmodifier) ? attachment.system.itemmodifier : [];
      installed.forEach((modification, index) => {
        addAttributes(modification?.system?.attributes, {
          ranks: ranksOf(modification, modification?.name ?? ""),
          path: ["itemattachment", attachmentIndex, "itemmodifier", index],
          // a modification sitting in an attachment but not installed grants nothing, even
          // when the parent item is equipped (mirrors shouldUpdateAEStatus)
          disabled: baseDisabled || modification?.system?.active === false,
          source: modification?.name ?? "",
        });
      });
    });

    return { desired, ownedNames, renames, warnings };
  }

  /**
   * True when an existing Active Effect already matches what the plan wants, so reconciliation
   * can skip writing it. Values are compared as strings because Foundry stores them that way.
   * @param effect - the existing ActiveEffect document
   * @param planned - the corresponding entry from `planModifierEffects().desired`
   * @returns {boolean}
   */
  static effectMatchesPlan(effect, planned) {
    if (!!effect.disabled !== !!planned.disabled) return false;
    const current = effect.changes ?? [];
    if (current.length !== planned.changes.length) return false;
    return planned.changes.every((want, index) => {
      const have = current[index];
      return have
        && have.key === want.key
        && Number(have.mode) === Number(want.mode)
        && String(have.value) === String(want.value);
    });
  }

  /**
   * Render an effect's payload as short readable strings, so a reconcile report can show what
   * it is about to change rather than only that it changed. A rewrite that turns out to be a
   * no-op in play still deserves to be visible when a GM is reviewing a bulk repair.
   * @param changes - an effect's `changes` array
   * @param disabled
   * @returns {{disabled: boolean, changes: string[]}}
   */
  static describeEffect(changes, disabled) {
    return {
      disabled: !!disabled,
      changes: (changes ?? []).map(
        (change) => `${change.key || "(no key)"}=${change.value} (mode ${change.mode})`,
      ),
    };
  }

  /**
   * Turn the collision renames from a plan into a single item update.
   * Built from `_source` where available so reconciliation never persists derived fields.
   * @param item
   * @param renames - `planModifierEffects().renames`
   * @returns {object|null} - an update payload, or null when nothing needs rewriting
   */
  static buildAttrRenameUpdate(item, renames) {
    const source = item._source?.system ?? item.system ?? {};
    const modifiers = foundry.utils.deepClone(source.itemmodifier ?? []);
    const attachments = foundry.utils.deepClone(source.itemattachment ?? []);
    let touchedModifiers = false;
    let touchedAttachments = false;

    for (const rename of renames) {
      const [root, index, sub, subIndex] = rename.path;
      let attributes;
      if (root === "itemmodifier") {
        attributes = modifiers[index]?.system?.attributes;
        touchedModifiers = true;
      } else if (root === "itemattachment" && sub === "itemmodifier") {
        attributes = attachments[index]?.system?.itemmodifier?.[subIndex]?.system?.attributes;
        touchedAttachments = true;
      } else if (root === "itemattachment") {
        attributes = attachments[index]?.system?.attributes;
        touchedAttachments = true;
      }
      if (!attributes || !(rename.from in attributes)) continue;
      attributes[rename.to] = attributes[rename.from];
      delete attributes[rename.from];
    }

    const system = {};
    if (touchedModifiers) system.itemmodifier = modifiers;
    if (touchedAttachments) system.itemattachment = attachments;
    return Object.keys(system).length ? { system } : null;
  }

  /**
   * Rebuild an item's attribute-derived Active Effects so they match the qualities actually
   * on it -- creating what is missing, correcting what has drifted, and removing what no
   * longer has a source.
   *
   * This replaces the previous approach of patching effects from each call site in turn
   * (`syncAEStatus`, the item editor, the drop handler, the delete handler), which could not
   * repair an already-corrupt effect and matched effects by bare attribute key, so two
   * qualities sharing a key silently overwrote one another.
   *
   * @param item - the ItemFFG to reconcile
   * @param {object} [options]
   * @param {boolean} [options.applyRenames=true] - persist attribute-key collision fixes.
   *   Pass false from inside an update hook to avoid a re-entrant write.
   * @param {boolean} [options.dryRun=false] - compute the work without performing it
   * @returns {Promise<{created: string[], updated: string[], deleted: string[], renamed: object[], warnings: object[]}|null>}
   */
  static async reconcileModifierEffects(item, { applyRenames = true, dryRun = false } = {}) {
    if (!item || !ItemHelpers.RECONCILABLE_TYPES.includes(item.type)) return null;
    // compendium-resident documents are not ours to rewrite from a sheet interaction
    if (item.pack) return null;
    if (item.isEmbedded && item.actor?.compendium?.metadata) return null;

    let plan = ItemHelpers.planModifierEffects(item);
    const renamed = plan.renames.slice();

    if (plan.renames.length && applyRenames && !dryRun) {
      const update = ItemHelpers.buildAttrRenameUpdate(item, plan.renames);
      if (update) {
        await item.update(update, { render: false });
        // re-plan against the settled data so effect names match what was just persisted
        plan = ItemHelpers.planModifierEffects(item);
      }
    }

    const existing = item.getEmbeddedCollection("ActiveEffect");
    const bySystemName = new Map();
    const toDelete = [];
    for (const effect of existing) {
      // `(inherent)` and anything hand-made are left strictly alone
      if (!ItemHelpers.isSystemEffectName(effect.name)) continue;
      if (bySystemName.has(effect.name)) {
        // a duplicate name is the residue of a past attribute-key collision
        toDelete.push(effect);
        continue;
      }
      bySystemName.set(effect.name, effect);
    }

    const toCreate = [];
    const toUpdate = [];
    const updateDetails = [];
    for (const want of plan.desired) {
      const match = bySystemName.get(want.name);
      if (!match) {
        toCreate.push({ name: want.name, changes: want.changes, disabled: want.disabled });
        continue;
      }
      bySystemName.delete(want.name);
      if (!ItemHelpers.effectMatchesPlan(match, want)) {
        toUpdate.push({ _id: match.id, changes: want.changes, disabled: want.disabled });
        updateDetails.push({
          name: want.name,
          from: ItemHelpers.describeEffect(match.changes, match.disabled),
          to: ItemHelpers.describeEffect(want.changes, want.disabled),
        });
      }
    }
    // An effect is only an orphan when the attribute that produced it is GONE -- a quality
    // that was removed. An attribute that still exists but yields no Active Effect (damage,
    // boost, setback, advantage: see the "no-key" note in planModifierEffects) keeps its
    // effect untouched. Deleting on "not in desired" instead of "not owned" would wipe the
    // placeholder effect of every Accurate/Inaccurate/damage modifier in the world.
    for (const leftover of bySystemName.values()) {
      if (!plan.ownedNames.has(leftover.name)) toDelete.push(leftover);
    }

    const summary = {
      created: toCreate.map((effect) => effect.name),
      // objects, not bare names: an update is the one outcome whose significance cannot be
      // judged from the name alone, so it carries its own before/after
      updated: updateDetails,
      deleted: toDelete.map((effect) => effect.name),
      renamed,
      warnings: plan.warnings,
    };

    if (dryRun) return summary;

    if (toDelete.length) {
      await item.deleteEmbeddedDocuments("ActiveEffect", toDelete.map((effect) => effect.id), { render: false });
    }
    if (toUpdate.length) {
      await item.updateEmbeddedDocuments("ActiveEffect", toUpdate, { render: false });
    }
    if (toCreate.length) {
      await item.createEmbeddedDocuments("ActiveEffect", toCreate, { render: false });
    }

    if (summary.created.length || summary.updated.length || summary.deleted.length) {
      CONFIG.logger.debug(`Reconciled modifier effects on ${item.name}`, summary);
    }
    return summary;
  }

  /**
   * Run `reconcileModifierEffects` over every weapon / armour / attachment in the world, so
   * items corrupted before the reconciler existed are repaired without opening each sheet.
   *
   * Intended to be called by a GM from the console:
   *   `await game.starwarsffg.repairModifierEffects({dryRun: true})` to preview,
   *   then without `dryRun` to apply.
   *
   * @param {object} [options]
   * @param {boolean} [options.dryRun=false] - report what would change without changing it
   * @returns {Promise<{scanned: number, changed: Array<object>}>}
   */
  static async repairModifierEffects({ dryRun = false } = {}) {
    const report = { scanned: 0, changed: [] };
    const targets = [...game.items];
    for (const actor of game.actors) targets.push(...actor.items);

    for (const item of targets) {
      if (!ItemHelpers.RECONCILABLE_TYPES.includes(item.type)) continue;
      report.scanned += 1;
      const summary = await ItemHelpers.reconcileModifierEffects(item, { dryRun });
      if (!summary) continue;
      if (!summary.created.length && !summary.updated.length && !summary.deleted.length && !summary.renamed.length) {
        continue;
      }
      report.changed.push({
        item: item.name,
        actor: item.actor?.name ?? null,
        uuid: item.uuid,
        ...summary,
      });
    }

    CONFIG.logger.debug(`repairModifierEffects scanned ${report.scanned} item(s), ${report.changed.length} needed work`);
    return report;
  }

  /**
   * Determines if a given Active Effect should have a status updated or not - based on the item it's a part of
   * For example, if a piece of armor has an attachment with a modification with a mod that's not installed,
   *  that mod should not apply any effect to the actor - even if the armor is equipped / unequipped
   * Similarly, unpurchased talents on specializations should not do anything until they are purchased
   * @param item - the item the active effect is a part of
   * @param activeEffect - the specific active effect to check
   * @returns {Promise<boolean>} - bool representing if the changes should be applied or not
   *
   */
  static async shouldUpdateAEStatus(item, activeEffect) {
    CONFIG.logger.debug(`Checking if ${activeEffect.name} from ${item.name} should be applied`);
    if (["armour", "weapon", "shipweapon"].includes(item.type)) {
      for (const attachment of item.system.itemattachment) {
        for (const modification of attachment.system.itemmodifier) {
          try {
            const foundMod = modification.system.attributes[activeEffect.name];
            CONFIG.logger.debug(`Located mod ${activeEffect.name}, checking if it's active or not`);
            if (foundMod && !modification.system.active) {
              CONFIG.logger.debug(`Mod ${activeEffect.name} is not active, not syncing AE status`);
              return false;
            } else {
              CONFIG.logger.debug(`Mod ${activeEffect.name} is active, syncing AE status`);
              return true;
            }
          } catch {
            CONFIG.logger.debug(`No mod located, continuing search...`);
          }
        }
      }
    }
    CONFIG.logger.debug(`No reason to avoid updating status found, syncing AE status`);
    return true;
  }

  /**
   * Sync the status of an active effect to the parent object when an item is updated
   * For example, enable an active effect on a talent as a part of a specialization when that talent is purchased
   * @param item
   * @param activeEffects
   * @returns {Promise<void>}
   */
  static async syncAEStatus(item, activeEffects) {
    CONFIG.logger.debug(`Syncing ${activeEffects.length} Active Effects status...`);
    if (["specialization"].includes(item.type)) {
      CONFIG.logger.debug("specialization, looking through AEs to sync");
      await ItemHelpers.syncTreeActiveEffects(item, item.system.talents, "talent");
    } else if (["forcepower", "signatureability"].includes(item.type)) {
      CONFIG.logger.debug("force power or signature ability, looking through AEs to sync");
      await ItemHelpers.syncTreeActiveEffects(item, item.system.upgrades, "upgrade");
    } else if (["armour", "weapon", "shipweapon"].includes(item.type)) {
      CONFIG.logger.debug("armor and weapon, checking modifiers to sync value to rank");
      // sync AEs to the rank value - that is, if we have a mod which adds 1 to max wounds with 4 ranks, the AE should have a value of 4, not 1
      const existingEffects = item.getEmbeddedCollection("ActiveEffect");
      for (const modifier of item.system.itemmodifier) {
        for (const attr of Object.keys(modifier.system.attributes)) {
          const matchingEffect = existingEffects.find(effect => effect.name === attr);
          if (matchingEffect) {
            // Sync this source's own rank only. rank_current is the summarized rank across
            // same-named direct and attachment qualities; attachments have their own effects.
            const rawRank = modifier.system.rank;
            const ranks = (rawRank === undefined || rawRank === null || rawRank === "")
              ? 1
              : Number(rawRank);
            const newValue = ranks * Number(modifier.system.attributes[attr].value);
            if (!Number.isFinite(newValue)) {
              CONFIG.logger.warn(`Skipping AE sync for ${attr} on ${item.name}: rank=${modifier.system.rank}, value=${modifier.system.attributes[attr].value}`);
              continue;
            }
            CONFIG.logger.debug(`Located ${attr}, updating with new value of ${newValue}`);
            await matchingEffect.update({
              "changes": [{
                key: matchingEffect.changes[0].key,
                mode: matchingEffect.changes[0].mode,
                value: newValue,
              }],
            });
          }
        }
      }
    } else {
      CONFIG.logger.debug(`'other' item type ${item.type}, no need to sync AE status'`);
    }
  }

  /**
   * Rebuild Active Effects for learned tree nodes from their current modifier data.
   * Some imported or migrated tree-node effects can have stale change payloads; updating
   * disabled alone does not reliably make Foundry re-apply those item effects.
   *
   * @param item
   * @param tree
   * @param nodeLabel
   * @returns {Promise<void>}
   */
  static async syncTreeActiveEffects(item, tree, nodeLabel) {
    // Thin document-applying wrapper around the pure reconcileTreeEffects() core.
    // Read the existing effects as plain sources (mirroring exactly the four
    // getFlag reads plus id/name the reconcile algorithm matches on), compute the
    // patches without any document I/O, then apply them.
    const existingEffects = Array.from(item.getEmbeddedCollection("ActiveEffect"));
    const effectSources = existingEffects.map((effect) => ({
      id: effect.id,
      name: effect.name,
      flags: {
        starwarsffg: {
          treeActiveEffect: effect.getFlag("starwarsffg", "treeActiveEffect"),
          treeAttribute: effect.getFlag("starwarsffg", "treeAttribute"),
          treeNode: effect.getFlag("starwarsffg", "treeNode"),
          treeNodeType: effect.getFlag("starwarsffg", "treeNodeType"),
        },
      },
    }));

    const { updates, creates } = ItemHelpers.reconcileTreeEffects(effectSources, tree, nodeLabel, item.img);
    const byId = new Map(existingEffects.map((effect) => [effect.id, effect]));

    for (const patch of updates) {
      CONFIG.logger.debug(`located attribute granting AE (${patch.name}) from ${nodeLabel} (${patch.nodeName}), syncing changes and disabled=${patch.disabled}`);
      await byId.get(patch.id).update({
        changes: patch.changes,
        disabled: patch.disabled,
        flags: patch.flags,
      });
    }

    if (creates.length) {
      // Rebuild the create sources explicitly (dropping the log-only nodeName) so
      // the created documents match the original toCreate shape exactly.
      const toCreate = creates.map((create) => {
        CONFIG.logger.debug(`located attribute granting AE (${create.name}) from ${nodeLabel} (${create.nodeName}), syncing changes and disabled=${create.disabled}`);
        return {
          name: create.name,
          img: create.img,
          changes: create.changes,
          disabled: create.disabled,
          flags: create.flags,
        };
      });
      await item.createEmbeddedDocuments("ActiveEffect", toCreate);
    }
  }

  /**
   * Pure core of syncTreeActiveEffects: compute the Active-Effect patches that
   * bring an item's tree effects in line with its node tree, WITHOUT touching any
   * document. Operates on plain source arrays and returns patches; the wrapper
   * above applies them. to-item-data.js (Stage 9) consumes this by injection.
   *
   * Algorithm preserved verbatim from the original syncTreeActiveEffects:
   *  - build one desired effect per node attribute whose buildActiveEffectChanges
   *    result is non-empty (attributes starting with "-=" are skipped);
   *  - for each desired effect, claim an unclaimed effect matching the EXACT tree
   *    flag tuple first, else one unclaimed same-name effect;
   *  - a claimed effect yields an UPDATE patching ONLY changes / disabled
   *    (= !islearned) / tree-flags; an unmatched desired effect yields an id-less
   *    CREATE; unclaimed existing effects are NEVER deleted.
   *
   * @param {Array<{id:*, name:string, flags:object}>} effectSources  existing effect sources
   * @param {object} tree        node map: { nodeKey: { attributes, islearned, name, img } }
   * @param {string} nodeLabel   "talent" | "upgrade"
   * @param {string} fallbackImg image to use when a node has no img (the item's img)
   * @returns {{updates: Array<{id:*, name:string, nodeName:string, changes:Array, disabled:boolean, flags:object}>,
   *            creates: Array<{name:string, img:string, nodeName:string, changes:Array, disabled:boolean, flags:object}>}}
   */
  static reconcileTreeEffects(effectSources, tree, nodeLabel, fallbackImg) {
    const desiredEffects = [];
    const updates = [];
    const creates = [];
    const claimedEffects = new Set();

    for (const nodeKey of Object.keys(tree || {})) {
      const node = tree[nodeKey];
      for (const attrName of Object.keys(node.attributes || {})) {
        if (attrName.startsWith("-=")) {
          continue;
        }

        const changes = ItemHelpers.buildActiveEffectChanges(node.attributes[attrName], attrName);
        if (!changes.length) {
          continue;
        }

        desiredEffects.push({
          name: attrName,
          img: node.img || fallbackImg,
          changes,
          disabled: !node.islearned,
          flags: {
            starwarsffg: {
              treeActiveEffect: true,
              treeAttribute: attrName,
              treeNode: nodeKey,
              treeNodeType: nodeLabel,
            },
          },
          nodeName: node.name,
        });
      }
    }

    for (const effectData of desiredEffects) {
      const flaggedEffect = effectSources.find((effect) =>
        !claimedEffects.has(effect.id) &&
        effect.flags?.starwarsffg?.treeActiveEffect &&
        effect.flags?.starwarsffg?.treeAttribute === effectData.flags.starwarsffg.treeAttribute &&
        effect.flags?.starwarsffg?.treeNode === effectData.flags.starwarsffg.treeNode &&
        effect.flags?.starwarsffg?.treeNodeType === effectData.flags.starwarsffg.treeNodeType
      );
      const unclaimedEffect = flaggedEffect || effectSources.find((effect) => !claimedEffects.has(effect.id) && effect.name === effectData.name);

      if (unclaimedEffect) {
        claimedEffects.add(unclaimedEffect.id);
        updates.push({
          id: unclaimedEffect.id,
          name: effectData.name,
          nodeName: effectData.nodeName,
          changes: effectData.changes,
          disabled: effectData.disabled,
          flags: effectData.flags,
        });
      } else {
        creates.push({
          name: effectData.name,
          img: effectData.img,
          nodeName: effectData.nodeName,
          changes: effectData.changes,
          disabled: effectData.disabled,
          flags: effectData.flags,
        });
      }
    }

    return { updates, creates };
  }

  /**
   * Materialize a tree item's purchased nodes on a plain item SOURCE (no document),
   * for the PC wizard's in-memory build. Deep-clones the source, sets `islearned` for
   * the purchased node keys (specialization → system.talents; forcepower /
   * signatureability → system.upgrades, per the syncAEStatus dispatch), then reconciles
   * the clone's `effects` with the SAME pure algorithm the sheet uses
   * (reconcileTreeEffects). N-7: flipping `islearned` alone leaves a node stat-inert —
   * the effects must be re-synced so learned nodes are enabled.
   *
   * The production wizard binds this by injection through build-deps.js (DEV-16); the
   * wizard's to-item-data.js must never import this poisoned module directly.
   *
   * @param {object} itemSource   a plain item source (e.g. a SelectionRef snapshot)
   * @param {string[]} learnedKeys  purchased node keys
   * @returns {object} a new, materialized item source
   */
  static materializeTreePurchases(itemSource, learnedKeys) {
    const source = foundry.utils.deepClone(itemSource);

    let treeKey;
    let nodeLabel;
    if (source.type === "specialization") {
      treeKey = "talents";
      nodeLabel = "talent";
    } else if (source.type === "forcepower" || source.type === "signatureability") {
      treeKey = "upgrades";
      nodeLabel = "upgrade";
    } else {
      return source; // not a tree item — nothing to materialize
    }

    const tree = source.system?.[treeKey] ?? {};
    const learned = new Set(learnedKeys ?? []);
    for (const nodeKey of Object.keys(tree)) {
      if (nodeKey.startsWith("-=")) continue;
      tree[nodeKey].islearned = learned.has(nodeKey);
    }

    const existingEffects = Array.isArray(source.effects) ? source.effects : (source.effects = []);
    const effectSources = existingEffects.map((effect) => ({
      id: effect._id,
      name: effect.name,
      flags: effect.flags ?? {},
    }));
    const { updates, creates } = ItemHelpers.reconcileTreeEffects(effectSources, tree, nodeLabel, source.img);

    const byId = new Map(existingEffects.map((effect) => [effect._id, effect]));
    for (const patch of updates) {
      const effect = byId.get(patch.id);
      effect.changes = patch.changes;
      effect.disabled = patch.disabled;
      effect.flags = patch.flags;
    }
    for (const create of creates) {
      existingEffects.push({
        name: create.name,
        img: create.img,
        changes: create.changes,
        disabled: create.disabled,
        flags: create.flags,
      });
    }

    return source;
  }

  /**
   * Convert a modifier attribute into Active Effect changes.
   *
   * @param attribute
   * @param attrName
   * @returns {Array}
   */
  static buildActiveEffectChanges(attribute, attrName) {
    const changes = [];
    let modtype = attribute?.modtype;
    let mod = attribute?.mod;
    let value = attribute?.value;

    if ((!modtype || !mod) && attrName?.includes(".")) {
      const parts = attrName.split(".");
      if (parts.length >= 3) {
        modtype = modtype || parts[0];
        mod = mod || parts.slice(1, -1).join(".");
        value = value ?? parts[parts.length - 1];
      }
    }

    if (!modtype || !mod) {
      return changes;
    }

    const explodedMods = ModifierHelpers.explodeMod(modtype, mod);
    for (const curMod of explodedMods) {
      const key = ModifierHelpers.getModKeyPath(curMod.modType, curMod.mod);
      if (key) {
        changes.push({
          key,
          mode: AE_MODES.ADD,
          value,
        });
      }
    }

    return changes;
  }

  /**
   * Update the inherent Encumbrance Active Effect when armor is equipped/unequipped
   * (because the encumbrance is reduced by 3 when worn)
   * @param item - item being equipped
   * @param activeEffect - inherent AE for that item
   * @param equipped - if the item is now equipped or not
   * @returns {Promise<void>} - N/A, updates the change on the AE
   */
  static async updateEncumbranceOnEquip(item, activeEffect, equipped) {
    CONFIG.logger.debug("Updating encumbrance Active Effect on equip state change");
    const realEncumbrance = item?.system?.encumbrance?.value;
    if (item.type === "armour" && realEncumbrance) {
      const encumbranceModPath = ModifierHelpers.getModKeyPath("Stat", "Encumbrance");
      let updatedEncumbrance;
      if (equipped) {
        updatedEncumbrance = Math.max(realEncumbrance - 3, 0);
      } else {
        updatedEncumbrance = realEncumbrance;
      }
      CONFIG.logger.debug(`Original encumbrance: ${realEncumbrance}, new encumbrance: ${updatedEncumbrance}`);
      for (const change of activeEffect.changes) {
        if (change.key === encumbranceModPath) {
          change.value = updatedEncumbrance;
          break;
        }
      }
      await activeEffect.update({changes: activeEffect.changes});
    }
  }

  /**
   * Ensures unique attribute keys for a dropped item by checking and modifying its attributes, modifiers, and attachments
   * to avoid key collisions within the parent item. Also updates any matching active effects to align with the new attribute keys.
   *
   * @param {Object} droppedItem - The item being added or moved, whose attributes need to be checked and adjusted if necessary
   * @param {Object} parentItem - The target item that will contain the dropped item, used to determine existing keys for comparison
   * @return {Object} - Returns the modified dropped item with updated attribute keys and effects
   */
  static async uniqueAttrs(droppedItem, parentItem) {
    CONFIG.logger.debug(`Unique-ing attributes for dropped item ${droppedItem.name} on parent item ${parentItem.name}`);
    // collect the existing attrs so we can determine if there's a collision
    let existingAttrs = Object.keys(parentItem.system.attributes) || [];
    if (Object.keys(parentItem.system).includes("itemmodifier")) {
      for (const modifier of parentItem.system.itemmodifier) {
        existingAttrs = [...existingAttrs, ...Object.keys(modifier.system.attributes || {})];
      }
    }
    if (Object.keys(parentItem.system).includes("itemattachment")) {
      for (const attachment of parentItem.system.itemattachment) {
        existingAttrs = [...existingAttrs, ...Object.keys(attachment.system.attributes || {})];
        for (const modification of attachment.system.itemmodifier) {
          existingAttrs = [...existingAttrs, ...Object.keys(modification.system.attributes || {})];
        }
      }
    }
    if (Object.keys(parentItem.system).includes("talents")) {
      for (const talent of Object.keys(parentItem.system.talents)) {
        if (!Object.keys(parentItem.system.talents[talent]).includes("attributes")) {
          // some talent slots do not have the "attributes" key, so we can skip them
          continue;
        }
        existingAttrs = [...existingAttrs, ...Object.keys(parentItem.system.talents[talent].attributes)];
      }
    }
    CONFIG.logger.debug(`Existing attributes: ${JSON.stringify(existingAttrs)}`);

    // now that we know the existing attrs, start looking for ones in the dropped item
    if (Object.keys(droppedItem.system).includes("attributes")) {
      for (const attr of Object.keys(droppedItem.system.attributes)) {
        const matchingEffect = droppedItem.effects.find(effect => effect.name === attr);
        const newKey = `attr${new Date().getTime()}`;
        // copy the data to the new field
        droppedItem.system.attributes[newKey] = droppedItem.system.attributes[attr];
        // delete the old field
        delete droppedItem.system.attributes[attr];
        // update the active effect
        if (matchingEffect) {
          CONFIG.logger.debug(`located matching effect from attributes ${matchingEffect.name}, updating to ${newKey}`);
          matchingEffect.name = newKey;
        }
        // ensure further keys have a new entry
          await new Promise(r => setTimeout(r, 1));
      }
    }

    if (Object.keys(droppedItem.system).includes("itemmodifier")) {
      for (const droppedModifier of droppedItem.system.itemmodifier) {
        if (droppedModifier.system.attributes) {
          for (const attr of Object.keys(droppedModifier.system.attributes)) {
            CONFIG.logger.debug(`checking ${attr}`);
            const matchingEffect = droppedItem.effects.find(effect => effect.name === attr);
            const newKey = `attr${new Date().getTime()}`;
            CONFIG.logger.debug(`located matching effect from itemmodifier ${droppedModifier.name} for ${attr}, updating to ${newKey}`);
            // copy the data to the new field
            droppedModifier.system.attributes[newKey] = droppedModifier.system.attributes[attr];
            // delete the old field
            delete droppedModifier.system.attributes[attr];
            // update the active effect
            if (matchingEffect) {
              matchingEffect.name = newKey;
            }
            // ensure further keys have a new entry
            await new Promise(r => setTimeout(r, 1));
          }
        }
      }
    }

    CONFIG.logger.debug(`Done Unique-ing attributes!`);
    return droppedItem;
  }
}
