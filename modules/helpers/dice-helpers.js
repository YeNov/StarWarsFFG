import PopoutEditor from "../popout-editor.js";
import RollBuilderFFG from "../dice/roll-builder.js";
import ModifierHelpers from "../helpers/modifiers.js";
import ImportHelpers from "../importer/import-helpers.js";
import { DicePoolFFG } from "../dice-pool-ffg.js";

export default class DiceHelpers {
  static async rollSkill(obj, event, type, flavorText, sound) {
    const data = await obj.getData();
    const row = event.target.parentElement.parentElement;
    let skillName = row.parentElement.dataset["ability"];
    if (skillName === undefined) {
      skillName = row.dataset["ability"];
      if (skillName === undefined) {
        skillName = row.parentElement.parentElement.parentElement.dataset["ability"];
      }
    }

    let skills;
    const theme = await game.settings.get("starwarsffg", "skilltheme");
    try {
      skills = JSON.parse(JSON.stringify(CONFIG.FFG.alternateskilllists.find((list) => list.id === theme).skills));
    } catch (err) {
      // if we run into an error use the default starwars skill set
      skills = JSON.parse(JSON.stringify(CONFIG.FFG.alternateskilllists.find((list) => list.id === "starwars").skills));
      CONFIG.logger.warn(`Unable to load skill theme ${theme}, defaulting to starwars skill theme`, err);
    }

    let skillData = skills?.[skillName];

    if (!skillData) {
      skillData = data.data[skillName];
    }

    let skill = {
      rank: 0,
      characteristic: "",
      boost: 0,
      setback: 0,
      force: 0,
      advantage: 0,
      dark: 0,
      light: 0,
      failure: 0,
      threat: 0,
      success: 0,
      triumph: 0,
      despair: 0,
      remsetback: 0,
      upgrades: 0,
      label: skillData?.label ? game.i18n.localize(skillData.label) : game.i18n.localize(skillName),
      source: {},
    };
    let characteristic = {
      value: 0,
    };

    if (data?.data?.skills?.[skillName]) {
      skill = data.data.skills[skillName];
    }
    if (data?.data?.characteristics?.[skill?.characteristic]) {
      characteristic = data.data.characteristics[skill.characteristic];
    }

    const actor = await game.actors.get(data.actor._id);

    // Determine if this roll is triggered by an item.
    let item;
    if ($(row.parentElement).hasClass("item")) {
      //Check if token is linked to actor
      if (obj.actor.token === null) {
        let itemID = row.parentElement.dataset["itemId"];
        item = actor.items.get(itemID);
      } else {
        //Rolls this if unlinked
        let itemID = row.parentElement.dataset["itemId"];
        item = obj.actor.token.actor.items.get(itemID);
      }
    }

    if (item && item.type === "weapon") {
      const ammoEnabled = item.getFlag("starwarsffg", "config.enableAmmo");
      if (ammoEnabled && item.system.ammo.value <= 0) {
        return ui.notifications.warn("Not enough ammo!");
      }
    }

    const itemData = item || {};
    const status = this.getWeaponStatus(itemData);
    let defenseDice = this.getDefenseDice(skill, itemData);

    // TODO: Get weapon specific modifiers from itemmodifiers and itemattachments

    let dicePool = new DicePoolFFG({
      ability: Math.max(characteristic.value, skill.rank),
      boost: skill.boost ?? 0,
      setback: (skill.setback ?? 0) + status.setback + defenseDice,
      force: skill.force ?? 0,
      advantage: skill.advantage ?? 0,
      dark: skill.dark ?? 0,
      light: skill.light ?? 0,
      failure: skill.failure ?? 0,
      threat: skill.threat ?? 0,
      success: skill.success ?? 0,
      triumph: skill.triumph ?? 0,
      despair: skill.despair ?? 0,
      upgrades: skill.upgrades ?? 0,
      remsetback: skill.remsetback ?? 0,
      difficulty: 2 + status.difficulty + (skill.difficulty ?? 0), // default average + status-effect difficulty dice
    });

    dicePool.upgrade(Math.min(characteristic.value, skill.rank) + dicePool.upgrades);
    // status-effect difficulty upgrades (mirrors skill.upgrades for ability)
    dicePool.upgradeDifficulty(skill.upgradeDifficulty ?? 0);

    if (type === "ability") {
      dicePool.upgrade();
    } else if (type === "difficulty") {
      dicePool.upgradeDifficulty();
    }

    dicePool = new DicePoolFFG(await this.getModifiers(dicePool, itemData));
    await this.displayRollDialog(data, dicePool, `${game.i18n.localize("SWFFG.Rolling")} ${game.i18n.localize(skill.label)}`, skill.label, itemData, flavorText, sound);
  }

  static getDefenseDice(skill, itemData){
    let defenseDice = 0;
    if (game.settings.get("starwarsffg", "useDefense")) {
      let isRanged = ["Ranged: Light", "Ranged: Heavy", "Gunnery"].includes(skill.value);
      let isMelee = ["Melee", "Brawl", "Lightsaber"].includes(skill.value);
      if (itemData?.type === "weapon" || itemData?.metaData?.tags?.includes("weapon")) {
        if (game.user.targets.size > 0) {
          for (const target of game.user.targets) {
            if (isRanged) {
              defenseDice = Math.max(defenseDice, target.actor.system.stats.defence.ranged);
            } else if (isMelee) {
              defenseDice = Math.max(defenseDice, target.actor.system.stats.defence.melee);
            }
          }
        }
      }
    }
    return defenseDice;
  }

  static async displayRollDialog(data, dicePool, description, skillName, item, flavorText, sound) {
    return new RollBuilderFFG(data, dicePool, description, skillName, item, flavorText, sound).render(true);
  }

  static async addSkillDicePool(data, elem) {
    const skillName = elem.dataset["ability"];
    if (data.data.skills[skillName]) {
      const skill = data.data.skills[skillName];
      const characteristic = data.data.characteristics[skill.characteristic];

      const dicePool = new DicePoolFFG({
        ability: Math.max(characteristic?.value ? characteristic.value : 0, skill?.rank ? skill.rank : 0),
        boost: skill.boost,
        setback: skill.setback,
        force: skill.force,
        advantage: skill.advantage,
        dark: skill.dark,
        light: skill.light,
        failure: skill.failure,
        threat: skill.threat,
        success: skill.success,
        triumph: skill?.triumph ? skill.triumph : 0,
        despair: skill?.despair ? skill.despair : 0,
        upgrades: skill?.upgrades ? skill.upgrades : 0,
        remsetback: skill?.remsetback ? skill.remsetback : 0,
        source: {
          skill: skill?.ranksource?.length ? skill.ranksource : [],
          boost: skill?.boostsource?.length ? skill.boostsource : [],
          remsetback: skill?.remsetbacksource?.length ? skill.remsetbacksource : [],
          setback: skill?.setbacksource?.length ? skill.setbacksource : [],
          advantage: skill?.advantagesource?.length ? skill.advantagesource : [],
          dark: skill?.darksource?.length ? skill.darksource : [],
          light: skill?.lightsource?.length ? skill.lightsource : [],
          failure: skill?.failuresource?.length ? skill.failuresource : [],
          threat: skill?.threatsource?.length ? skill.threatsource : [],
          success: skill?.successsource?.length ? skill.successsource : [],
          triumph: skill?.triumphsource?.length ? skill.triumphsource : [],
          despair: skill?.despairsource?.length ? skill.despairsource : [],
          upgrades: skill?.upgradessource?.length ? skill.upgradessource : [],
        },
      });
      dicePool.upgrade(Math.min(characteristic.value, skill.rank) + dicePool.upgrades);

      const rollButton = elem.querySelector(".roll-button");
      dicePool.renderPreview(rollButton);
    }
  }

  static async rollItem(itemId, actorId, flavorText, sound) {
    const actor = game.actors.get(actorId);
    const actorSheet = await actor.sheet.getData();

    const item = actor.items.get(itemId);
    const itemData = item.system;
    await item.setFlag("starwarsffg", "uuid", item.uuid);

    const status = this.getWeaponStatus(item);

    const skill = actor.system.skills[itemData.skill.value];
    const characteristic = actor.system.characteristics[skill.characteristic];
    let defenseDice = this.getDefenseDice(skill, itemData);
    let dicePool = new DicePoolFFG({
      ability: Math.max(characteristic.value, skill.rank),
      boost: skill.boost,
      setback: (skill.setback ?? 0) + status.setback + defenseDice,
      force: skill.force,
      advantage: skill.advantage,
      dark: skill.dark,
      light: skill.light,
      failure: skill.failure,
      threat: skill.threat,
      success: skill.success,
      triumph: skill?.triumph ? skill.triumph : 0,
      despair: skill?.despair ? skill.despair : 0,
      upgrades: skill?.upgrades ? skill.upgrades : 0,
      remsetback: skill?.remsetback ? skill.remsetback : 0,
      difficulty: 2 + status.difficulty + (skill.difficulty ?? 0), // default average + status-effect difficulty dice
    });

    dicePool.upgrade(Math.min(characteristic.value, skill.rank) + dicePool.upgrades);
    dicePool.upgradeDifficulty(skill.upgradeDifficulty ?? 0);

    dicePool = new DicePoolFFG(await this.getModifiers(dicePool, item));

    this.displayRollDialog(actorSheet, dicePool, `${game.i18n.localize("SWFFG.Rolling")} ${skill.label}`, skill.label, item, flavorText, sound);
  }

  // Takes a skill object, characteristic object, difficulty number and ActorSheetFFG.getData() object and creates the appropriate roll dialog.
  static async rollSkillDirect(skill, characteristic, difficulty, sheet, flavorText, sound) {
    const dicePool = new DicePoolFFG({
      ability: Math.max(characteristic.value, skill.rank),
      boost: skill.boost,
      setback: skill.setback,
      force: skill.force,
      difficulty: difficulty + (skill.difficulty ?? 0),
      advantage: skill.advantage,
      dark: skill.dark,
      light: skill.light,
      failure: skill.failure,
      threat: skill.threat,
      success: skill.success,
      triumph: skill?.triumph ? skill.triumph : 0,
      despair: skill?.despair ? skill.despair : 0,
      remsetback: skill?.remsetback ? skill.remsetback : 0,
      upgrades: skill?.upgrades ? skill.upgrades : 0,
    });

    dicePool.upgrade(Math.min(characteristic.value, skill.rank) + dicePool.upgrades);
    dicePool.upgradeDifficulty(skill.upgradeDifficulty ?? 0);

    this.displayRollDialog(sheet, dicePool, `${game.i18n.localize("SWFFG.Rolling")} ${skill.label}`, skill.label, {}, flavorText, sound);
  }

  static getWeaponStatus(item) {
    let setback = 0;
    let difficulty = 0;

    if ((item.type === "weapon" || item.type === "shipweapon" ) && item?.system?.status && item.system.status !== "None") {
      const status = CONFIG.FFG.itemstatus[item.system.status].attributes.find((i) => i.mod === "Setback");

      if (status.value < 99) {
        if (status.value === 1) {
          setback = status.value;
        } else {
          difficulty = 1;
        }
      } else {
        ui.notifications.error(`${item.name} ${game.i18n.localize("SWFFG.ItemTooDamagedToUse")} (${game.i18n.localize(CONFIG.FFG.itemstatus[item.system.status].label)}).`);
        return;
      }
    }

    return { setback, difficulty };
  }

  static async getModifiers(dicePool, item) {
    if (item.type === "weapon" || item.type === "shipweapon") {
      dicePool = await ModifierHelpers.getDicePoolModifiers(dicePool, item, []);

      if (item?.system?.itemattachment) {
        await ImportHelpers.asyncForEach(item.system.itemattachment, async (attachment) => {
          //get base mods and additional mods totals
          dicePool = await ModifierHelpers.getDicePoolModifiers(dicePool, attachment, []);
          const activeModifiers = attachment.system.itemmodifier.filter((i) => i.system?.active);
          await ImportHelpers.asyncForEach(activeModifiers, async (modifier) => {
            dicePool = await ModifierHelpers.getDicePoolModifiers(dicePool, modifier, []);
          });
        });
      }
      if (item?.system?.itemmodifier) {
        await ImportHelpers.asyncForEach(item.system.itemmodifier, async (modifier) => {
          dicePool = await ModifierHelpers.getDicePoolModifiers(dicePool, modifier, []);
        });
      }
    }

    return dicePool;
  }
}

/**
 * Helper function to build a dice pool
 * @param actor_id ID of the actor making the check
 * @param skill_name name of the string of the skill
 * @param incoming_roll existing dice, e.g. difficulty dice
 * @returns {DicePoolFFG}
 */
export function get_dice_pool(actor_id, skill_name, incoming_roll) {
  const incomingPool = incoming_roll instanceof DicePoolFFG ? incoming_roll : new DicePoolFFG(incoming_roll ?? {});
  const actor = resolveDicePoolActor(actor_id, skill_name);
  const { skill } = resolveSkill(actor, skill_name);
  const characteristic = actor?.system?.characteristics?.[skill?.characteristic];

  if (!actor || !skill || !characteristic) {
    CONFIG.logger.debug(`Unable to build dice pool for actor ${actor_id} and skill ${skill_name}`);
    return incomingPool;
  }

  const characteristicValue = Number(characteristic.value) || 0;
  const skillRank = Number(skill.rank) || 0;

  const dicePool = new DicePoolFFG({
    ability: Math.max(characteristicValue, skillRank) + incomingPool.ability - (Math.min(characteristicValue, skillRank) + incomingPool.proficiency),
    proficiency: Math.min(characteristicValue, skillRank) + incomingPool.proficiency,
    boost: (skill.boost ?? 0) + incomingPool.boost,
    setback: (skill.setback ?? 0) + incomingPool.setback,
    force: (skill.force ?? 0) + incomingPool.force,
    advantage: (skill.advantage ?? 0) + incomingPool.advantage,
    dark: (skill.dark ?? 0) + incomingPool.dark,
    light: (skill.light ?? 0) + incomingPool.light,
    failure: (skill.failure ?? 0) + incomingPool.failure,
    threat: (skill.threat ?? 0) + incomingPool.threat,
    success: (skill.success ?? 0) + incomingPool.success,
    triumph: (skill.triumph ?? 0) + incomingPool.triumph,
    despair: (skill.despair ?? 0) + incomingPool.despair,
    upgrades: (skill.upgrades ?? 0) + incomingPool.upgrades,
    remsetback: (skill.remsetback ?? 0) + incomingPool.remsetback,
    difficulty: +incomingPool.difficulty + (skill.difficulty ?? 0),
    challenge: +incomingPool.challenge,
  });
  dicePool.upgradeDifficulty(skill.upgradeDifficulty ?? 0);
  return dicePool;
}

function resolveDicePoolActor(actor_id, skill_name) {
  const actors = [];
  const worldActor = game.actors.get(actor_id);

  for (const token of globalThis.canvas?.tokens?.controlled ?? []) {
    if (token?.actor?.id === actor_id) {
      actors.push(token.actor);
    }
  }

  if (worldActor) {
    actors.push(worldActor);
  }

  for (const token of worldActor?.getActiveTokens?.() ?? []) {
    if (token?.actor) {
      actors.push(token.actor);
    }
  }

  return actors.find((actor) => resolveSkill(actor, skill_name).skill) ?? actors[0] ?? null;
}

function resolveSkill(actor, skill_name) {
  const skills = actor?.system?.skills ?? {};
  const candidates = [
    skill_name,
    findSkillKeyByData(skills, skill_name),
    convert_skill_name(skill_name),
  ].filter((skillKey, index, array) => skillKey && array.indexOf(skillKey) === index);

  for (const skillKey of candidates) {
    if (skills?.[skillKey]) {
      const configuredSkill = getConfiguredSkill(skillKey) ?? {};
      return {
        key: skillKey,
        skill: {
          ...configuredSkill,
          ...skills[skillKey],
          characteristic: skills[skillKey].characteristic ?? configuredSkill.characteristic,
        },
      };
    }
  }

  const configuredSkillKey = candidates.find((skillKey) => getConfiguredSkill(skillKey));
  if (configuredSkillKey) {
    return {
      key: configuredSkillKey,
      skill: {
        rank: 0,
        ...getConfiguredSkill(configuredSkillKey),
      },
    };
  }

  return { key: null, skill: null };
}

function findSkillKeyByData(skills, skill_name) {
  if (!skill_name) {
    return null;
  }

  if (skills?.[skill_name]) {
    return skill_name;
  }

  const normalizedName = String(skill_name).toLowerCase();
  return Object.keys(skills ?? {}).find((skillKey) => {
    const skill = skills[skillKey];

    if (!skill) {
      return false;
    }

    const localizedLabel = skill.label ? game.i18n.localize(skill.label) : null;
    return [skillKey, skill.name, skill.value, skill.label, localizedLabel]
      .filter((candidate) => candidate !== undefined && candidate !== null)
      .some((candidate) => String(candidate).toLowerCase() === normalizedName);
  }) ?? null;
}

function getConfiguredSkill(skillKey) {
  if (!skillKey) {
    return null;
  }

  const theme = game.settings.get("starwarsffg", "skilltheme");
  const skillLists = CONFIG.FFG?.alternateskilllists ?? [];
  const themeSkill = skillLists.find((list) => list.id === theme)?.skills?.[skillKey];
  const starWarsSkill = skillLists.find((list) => list.id === "starwars")?.skills?.[skillKey];
  const configuredSkill = {
    ...(CONFIG.FFG?.skills?.[skillKey] ?? {}),
    ...(starWarsSkill ?? {}),
    ...(themeSkill ?? {}),
  };

  if (Object.keys(configuredSkill).length === 0) {
    return null;
  }

  return configuredSkill;
}

/**
 * Convert the skill name to how the game handles it
 * @param pool_skill_name skill name to be converted
 * @returns {null|string}
 */
function convert_skill_name(pool_skill_name) {
  if (!pool_skill_name) {
    return null;
  }

  CONFIG.logger.debug(`Converting ${pool_skill_name} to skill name`);
  const skills = CONFIG.FFG?.skills ?? {};

  if (skills?.[pool_skill_name]) {
    CONFIG.logger.debug(`Found direct mapping to ${pool_skill_name}`);
    return pool_skill_name;
  }

  for (const skill in skills) {
    if (skills[skill]["label"] && game.i18n.localize(skills[skill]["label"]) === pool_skill_name) {
      CONFIG.logger.debug(`Found mapping to ${skill}`);
      return skill;
    }
  }
  // it would appear that sometimes it's value instead of label
  for (const skill in skills) {
    if (skills[skill]["value"] === pool_skill_name) {
      CONFIG.logger.debug(`Found mapping to ${skill}`);
      return skill;
    }
  }
  CONFIG.logger.debug('WARNING: Found no mapping!');
  return null;
}
