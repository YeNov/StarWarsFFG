/**
 * Actor and item helpers for the e2e specs: build documents in the GM session, edit them through
 * their sheets, and check what reaches the prepared data and the sheets.
 *
 * Every document is created through the test's `sessions` fixture (playwright/foundry.js): its name
 * carries the test's run prefix, its id is tracked, and the fixture deletes it by id when the test
 * ends, pass or fail.
 *
 * Checks never write. `checkStat` reads the prepared document value and the sheet control that shows
 * it, and asserts both; it does not fill, click, select or update anything. Edits are separate
 * action methods (`setStat`, `addDirectModifier`, ...), each of which waits until the document holds
 * what it wrote.
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { FoundrySessions } from './foundry.js';

type FieldMap = Readonly<Record<string, Readonly<Record<string, string>>>>;

/*
 * The fields that checkStat and setStat accept, per document type: field key -> path under the
 * document's `system` data. The sheet control that shows a field is named `data.<path>`.
 *
 * Field keys use the system's own spelling, `defence` and `armour`, which is also the spelling of
 * the data paths and the control names. There are no aliases: nothing outside
 * e2e/activeEffects.spec.js and e2e/fixtures.spec.js calls these helpers, so `defense` or `armor`
 * is an unsupported field and throws like any other unknown key.
 */

/** Actor fields, per actor type. */
export const ACTOR_FIELDS: FieldMap = {
  character: {
    woundsMax: 'stats.wounds.max',
    woundsCurrent: 'stats.wounds.value',
    strainMax: 'stats.strain.max',
    strainCurrent: 'stats.strain.value',
    soak: 'stats.soak.value',
    defenceMelee: 'stats.defence.melee',
    defenceRanged: 'stats.defence.ranged',
    encumbranceMax: 'stats.encumbrance.max',
    encumbranceCurrent: 'stats.encumbrance.value',
    Brawn: 'characteristics.Brawn.value',
    Agility: 'characteristics.Agility.value',
    Intellect: 'characteristics.Intellect.value',
    Cunning: 'characteristics.Cunning.value',
    Willpower: 'characteristics.Willpower.value',
    Presence: 'characteristics.Presence.value',
  },
  vehicle: {
    armour: 'stats.armour.value',
    // The target of a `Vehicle Stat`/`Speed` modifier (ModifierHelpers.getModKeyPath): the speed
    // threshold, which the sheet labels "Threshold" under Speed.
    speedMax: 'stats.speed.max',
    encumbranceMax: 'stats.encumbrance.max',
    encumbranceCurrent: 'stats.encumbrance.value',
    customizationHardPoints: 'stats.customizationHardPoints.value',
  },
};

/** Item fields, per item type. */
export const ITEM_FIELDS: FieldMap = {
  armour: {
    defence: 'defence.value',
    soak: 'soak.value',
    encumbrance: 'encumbrance.value',
    hardpoints: 'hardpoints.value',
    rarity: 'rarity.value',
  },
  weapon: {
    encumbrance: 'encumbrance.value',
    hardpoints: 'hardpoints.value',
    rarity: 'rarity.value',
  },
  shipattachment: {
    encumbrance: 'encumbrance.value',
    hardpoints: 'hardpoints.value',
    rarity: 'rarity.value',
  },
  species: {
    Wounds: 'attributes.Wounds.value',
    Strain: 'attributes.Strain.value',
    Brawn: 'attributes.Brawn.value',
    Agility: 'attributes.Agility.value',
    Intellect: 'attributes.Intellect.value',
    Cunning: 'attributes.Cunning.value',
    Willpower: 'attributes.Willpower.value',
    Presence: 'attributes.Presence.value',
  },
};

/** The path of `field` for a document of `type`; throws, naming the supported keys, for any other. */
function fieldPath(method: string, fields: FieldMap, type: string, field: string): string {
  const supported = fields[type] ?? {};
  if (!Object.hasOwn(supported, field)) {
    const names = Object.keys(supported);
    throw new Error(`${method}: unsupported field '${field}' for ${type}; supported: ${names.length ? names.join(', ') : 'none'}`);
  }
  return supported[field];
}

/** The value at `system.<path>` of a document (its source data with `source`), as a control shows it. */
function systemValue(page: Page, uuid: string, path: string, { source = false } = {}): Promise<string> {
  return page.evaluate(({ uuid, path, source }) => {
    const doc = fromUuidSync(uuid);
    if (!doc) return `<no document ${uuid}>`;
    return String(foundry.utils.getProperty(source ? doc._source.system : doc.system, path));
  }, { uuid, path, source });
}

/** The source data of a document, as JSON. */
function sourceData(page: Page, uuid: string): Promise<object | null> {
  return page.evaluate((uuid) => fromUuidSync(uuid)?.toObject() ?? null, uuid);
}

/** Every named form control in `window`, as [name, value] pairs (`checked` for check boxes). */
function controlValues(window: Locator): Promise<Array<[string, string]>> {
  return window.locator('input[name], select[name], textarea[name]').evaluateAll((elements) => elements.map((element) => {
    const control = element as HTMLInputElement;
    const checkable = control.type === 'checkbox' || control.type === 'radio';
    return [control.name, checkable ? String(control.checked) : control.value] as [string, string];
  }));
}

interface CheckOptions {
  /** How long each read may wait for the expected value (default: the expect timeout). */
  timeout?: number;
}

/**
 * Asserts that the prepared value at `system.<path>` and the control named `data.<path>` in `window`
 * both equal `expected`. Read-only.
 */
async function checkField(page: Page, window: Locator, uuid: string, label: string, path: string, expected: string, { timeout }: CheckOptions) {
  await expect.poll(() => systemValue(page, uuid, path), { message: `${label}: prepared system.${path}`, timeout }).toBe(expected);
  await expect(window.locator(`[name="data.${path}"]`), `${label}: sheet control data.${path}`).toHaveValue(expected, { timeout });
}

/**
 * The specs drive the system's own sheets. A sheet package (Codex II) can pick another sheet per
 * user for documents without an explicit sheet choice, so each document names the system sheet.
 */
const SYSTEM_SHEET = {
  Actor: { core: { sheetClass: 'ffg.ActorSheetFFG' } },
  Item: { core: { sheetClass: 'ffg.ItemSheetFFG' } },
};

/** Shows the Items directory in the sidebar, where the specs drag items from. */
async function openItemsDirectory(page: Page) {
  await page.locator('#sidebar-tabs [data-tab="items"]').click();
  await expect(page.locator('section#items.sidebar-tab')).toBeVisible();
}

export class Actors {
  readonly page: Page;
  readonly name: string;
  private readonly sessions: FoundrySessions;
  private readonly label: string;
  private readonly actorType: string;
  private documentUuid: string | null = null;
  private sheetId: string | null = null;

  /**
   * @param sessions  The test's `sessions` fixture.
   * @param label     The actor's name without the run prefix.
   * @param actorType character, vehicle, ...
   */
  constructor(sessions: FoundrySessions, label: string, actorType: string) {
    this.sessions = sessions;
    this.page = sessions.gm;
    this.label = label;
    this.name = `${sessions.prefix}${label}`;
    this.actorType = actorType;
  }

  /** The created actor's UUID. */
  get uuid(): string {
    if (!this.documentUuid) throw new Error(`actor "${this.name}" has not been created`);
    return this.documentUuid;
  }

  /** The actor's open sheet. */
  get sheet(): Locator {
    if (!this.sheetId) throw new Error(`the sheet of actor "${this.name}" has not been opened`);
    return this.page.locator(`[id="${this.sheetId}"]`);
  }

  /**
   * Creates the actor (tracked by the sessions fixture) and opens its sheet.
   * @param options.system Source data for the actor's `system`.
   */
  async create({ system }: { system?: object } = {}) {
    const created = await this.sessions.create('Actor', { name: this.label, type: this.actorType, flags: SYSTEM_SHEET.Actor, ...(system ? { system } : {}) });
    this.documentUuid = created.uuid;
    this.sheetId = await this.page.evaluate(async (uuid) => {
      const sheet = fromUuidSync(uuid).sheet;
      await sheet.render(true);
      return sheet.id;
    }, this.uuid);
    await expect(this.sheet).toBeVisible();
  }

  async closeSheet() {
    await this.sheet.getByRole('button', { name: 'Close Window' }).click();
    await expect(this.sheet).toBeHidden();
  }

  /** Deletes the actor by id. The sessions fixture deletes it anyway when the test ends. */
  async remove() {
    await this.page.evaluate((uuid) => fromUuidSync(uuid)?.delete(), this.uuid);
    await expect.poll(() => this.page.evaluate((uuid) => Boolean(fromUuidSync(uuid)), this.uuid)).toBe(false);
  }

  /** Sheet tabs, per actor type: helper name -> the tab's `data-tab`. */
  private static readonly TABS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    character: { characteristics: 'characteristics', gear: 'items', talents: 'talents', crits: 'crits', bio: 'description' },
    vehicle: { components: 'components', crew: 'crew', cargo: 'items', bio: 'description', damage: 'damage' },
  };

  /** Shows a sheet tab. Clicking a tab does not submit the sheet. */
  async switchTab(tabName: string) {
    const tabs = Actors.TABS[this.actorType] ?? {};
    if (!Object.hasOwn(tabs, tabName)) {
      throw new Error(`switchTab: unknown tab '${tabName}' for ${this.actorType}; known: ${Object.keys(tabs).join(', ')}`);
    }
    await this.sheet.locator(`nav.sheet-tabs [data-tab="${tabs[tabName]}"]`).click();
    await expect(this.sheet.locator(`.sheet-body > .tab[data-tab="${tabs[tabName]}"]`)).toHaveClass(/\bactive\b/);
  }

  /**
   * Asserts that the actor's prepared `field` (see ACTOR_FIELDS) and the sheet control showing it both
   * equal `expected`. Read-only; an unsupported field throws.
   */
  async checkStat(field: string, expected: string, options: CheckOptions = {}) {
    const path = fieldPath('checkStat', ACTOR_FIELDS, this.actorType, field);
    await checkField(this.page, this.sheet, this.uuid, `${this.actorType} ${field}`, path, expected, options);
  }

  /** Every supported field's prepared value and control value, read without asserting. */
  async readFields(): Promise<Record<string, { document: string; control: string | null }>> {
    const fields = ACTOR_FIELDS[this.actorType] ?? {};
    const values: Record<string, { document: string; control: string | null }> = {};
    for (const [field, path] of Object.entries(fields)) {
      const control = this.sheet.locator(`[name="data.${path}"]`);
      values[field] = {
        document: await systemValue(this.page, this.uuid, path),
        control: (await control.count()) === 1 ? await control.inputValue() : null,
      };
    }
    return values;
  }

  /** The actor's source data and every control value of its sheet. */
  async snapshot() {
    return { source: await sourceData(this.page, this.uuid), controls: await controlValues(this.sheet) };
  }

  /** Toggles the equipped state of an owned item and waits until the actor's item records it. */
  async equipItem(item: Items) {
    const equipped = () => this.page.evaluate(({ uuid, name }) => {
      const owned = fromUuidSync(uuid).items.filter((candidate) => candidate.name === name);
      return owned.length === 1 ? Boolean(owned[0].system.equippable?.equipped) : `${owned.length} items named ${name}`;
    }, { uuid: this.uuid, name: item.name });
    const before = await equipped();
    if (typeof before !== 'boolean') throw new Error(`equipItem: ${before} on ${this.name}`);
    await this.sheet.locator('.item').filter({ hasText: item.name }).locator('.toggle-equipped').click();
    await expect.poll(equipped, { message: `${item.name} equipped state toggles` }).toBe(!before);
  }

  /** How many items named `name` the actor owns. */
  private ownedCount(name: string): Promise<number> {
    return this.page.evaluate(({ uuid, name }) => fromUuidSync(uuid).items.filter((owned) => owned.name === name).length, { uuid: this.uuid, name });
  }

  /**
   * Drags a world item from the Items directory onto the sheet and waits until the actor owns one
   * more item of that name.
   * @param options.target Where to drop; defaults to the sheet body (the sheet header is not a drop zone).
   * @param options.prompt The answer to the "Purchase item, or grant for 0 xp?" prompt that a character
   *                       sheet shows for a dropped talent, specialization, signature ability or force power.
   */
  async dropItem(item: Items, { target, prompt }: { target?: Locator; prompt?: 'Purchase' | 'Grant' } = {}) {
    const before = await this.ownedCount(item.name);
    await item.dragTo(target ?? this.sheet.locator('.sheet-body'));
    if (prompt) {
      const dialog = this.page.getByRole('dialog').filter({
        has: this.page.getByRole('heading', { name: 'Purchase item, or grant for 0 xp?' }),
      });
      await dialog.getByRole('button', { name: prompt }).click();
      await expect(dialog).toBeHidden();
    }
    await expect.poll(() => this.ownedCount(item.name), { message: `${item.name} is dropped on ${this.name}` }).toBe(before + 1);
  }

  /** Copies a world item onto the actor and waits until the sheet lists it. */
  async embedWorldItem(item: Items) {
    await this.page.evaluate(async ({ actorUuid, itemUuid }) => {
      const source = fromUuidSync(itemUuid).toObject();
      delete source._id;
      await fromUuidSync(actorUuid).createEmbeddedDocuments('Item', [source]);
    }, { actorUuid: this.uuid, itemUuid: item.uuid });
    await expect(this.sheet.locator('.item').filter({ hasText: item.name }).first()).toBeVisible();
  }

  /** Opens the sheet of an owned item and waits for it. */
  async editItem(item: Items) {
    const itemEntry = this.sheet.locator('.item').filter({ hasText: item.name }).first();
    const editControl = itemEntry.locator('.item-edit');
    if (await editControl.count()) {
      await editControl.click();
    } else {
      await itemEntry.click();
    }
    await expect(item.sheet).toBeVisible();
  }

  async checkSkillModifiers(skillName: string, modifierName: string, modifierValue: string) {
    const skillEntry = this.sheet.locator(`[data-ability="${skillName}"]`).locator('.dice-pool.hover');
    await expect(skillEntry).toContainText(`${modifierValue} ${modifierName}`);
  }

  async checkPreparedSkillModifier(skillName: string, modifierName: string, modifierValue: number) {
    await expect.poll(() => this.page.evaluate(
      ({ uuid, skillName, modifierName }) => Number(fromUuidSync(uuid)?.system?.skills?.[skillName]?.[modifierName] ?? 0),
      { uuid: this.uuid, skillName, modifierName },
    )).toBe(modifierValue);
  }
}

export class Items {
  readonly page: Page;
  readonly name: string;
  private readonly sessions: FoundrySessions;
  private readonly label: string;
  private readonly itemType: string;
  private readonly upgradeName: string;
  private documentUuid: string | null = null;

  /**
   * @param sessions The test's `sessions` fixture.
   * @param label    The item's name without the run prefix. A helper built with the label of an item
   *                 that was dragged into another document drives that copy's sheet or editor.
   * @param itemType armour, weapon, species, ...
   */
  constructor(sessions: FoundrySessions, label: string, itemType: string) {
    this.sessions = sessions;
    this.page = sessions.gm;
    this.label = label;
    this.name = `${sessions.prefix}${label}`;
    this.itemType = itemType;
    if (this.itemType === 'forcepower' || this.itemType === 'signatureability') {
      this.upgradeName = 'upgrade';
    } else {
      this.upgradeName = 'talent';
    }
  }

  /** The created world item's UUID. */
  get uuid(): string {
    if (!this.documentUuid) throw new Error(`item "${this.name}" has not been created`);
    return this.documentUuid;
  }

  /**
   * The open window that edits an item of this name: its sheet, or the editor of a copy embedded in
   * another item. Unique names keep it to one window; two open at once fail the strict locator.
   */
  get sheet(): Locator {
    return this.page.locator('.application').filter({
      has: this.page.locator(`input[name="name"][value="${this.name}"]`),
    });
  }

  /** The item's entry in the Items directory, the source of drags onto sheets. */
  get directoryEntry(): Locator {
    return this.page.locator('section#items .directory-item').filter({ hasText: this.name });
  }

  /**
   * Creates the world item (tracked by the sessions fixture), shows the Items directory, opens the sheet.
   * @param options.system Source data for the item's `system`.
   */
  async create({ system }: { system?: object } = {}) {
    await this.createWorld({ system });
    await openItemsDirectory(this.page);
    await this.page.evaluate((uuid) => fromUuidSync(uuid).sheet.render(true), this.uuid);
    await expect(this.sheet).toBeVisible();
  }

  /**
   * Creates the world item (tracked by the sessions fixture) without opening it.
   * @param options.system Source data for the item's `system`.
   */
  async createWorld({ system }: { system?: object } = {}) {
    const created = await this.sessions.create('Item', { name: this.label, type: this.itemType, flags: SYSTEM_SHEET.Item, ...(system ? { system } : {}) });
    this.documentUuid = created.uuid;
  }

  async closeSheet() {
    // Closing submits the sheet first and resolves once the window is gone.
    await this.sheet.getByRole('button', { name: 'Close Window' }).click();
    await expect(this.sheet).toBeHidden();
  }

  /** Deletes the world item by id. The sessions fixture deletes it anyway when the test ends. */
  async remove() {
    await this.page.evaluate((uuid) => fromUuidSync(uuid)?.delete(), this.uuid);
    await expect.poll(() => this.page.evaluate((uuid) => Boolean(fromUuidSync(uuid)), this.uuid)).toBe(false);
  }

  /** Drags the item's directory entry onto `target`, without waiting for what the drop does. */
  async dragTo(target: Locator) {
    await this.directoryEntry.dragTo(target);
  }

  /** How many attachments and modifications named `name` the item the sheet edits holds. */
  private async heldCount(name: string): Promise<number> {
    const uuid = await this.sheetDocumentUuid();
    return this.page.evaluate(({ uuid, name }) => {
      const system = fromUuidSync(uuid)._source.system;
      return [...(system.itemattachment ?? []), ...(system.itemmodifier ?? [])].filter((held) => held?.name === name).length;
    }, { uuid, name });
  }

  /**
   * Drags a world item (an attachment or modification) from the Items directory onto this item's
   * sheet and waits until the item holds one more of that name.
   * @param options.target Where to drop; defaults to the sheet's attachment list.
   */
  async dropItem(item: Items, { target }: { target?: Locator } = {}) {
    const before = await this.heldCount(item.name);
    await item.dragTo(target ?? this.sheet.locator('.attachments.items'));
    await expect.poll(() => this.heldCount(item.name), { message: `${item.name} is dropped on ${this.name}` }).toBe(before + 1);
  }

  /** Sheet tabs: helper name -> the tab's `data-tab`. */
  private static readonly TABS: Readonly<Record<string, string>> = {
    desc: 'description',
    modifiers: 'attributes',
    modifications: 'modifications',
    configuration: 'configuration',
    longDesc: 'sources',
  };

  /** Shows a sheet tab. Clicking a tab does not submit the sheet. */
  async switchTab(tabName: string) {
    if (!Object.hasOwn(Items.TABS, tabName)) {
      throw new Error(`switchTab: unknown tab '${tabName}'; known: ${Object.keys(Items.TABS).join(', ')}`);
    }
    const tab = Items.TABS[tabName];
    await this.sheet.locator(`nav.sheet-tabs [data-tab="${tab}"]`).click();
    await expect(this.sheet.locator(`.sheet-body > .tab[data-tab="${tab}"]`)).toHaveClass(/\bactive\b/);
  }

  /** The document the open sheet edits (the world item, or an owned copy). */
  private sheetDocumentUuid(): Promise<string> {
    return this.sheet.evaluate((element) => {
      const uuid = foundry.applications.instances.get(element.id)?.document?.uuid;
      if (!uuid) throw new Error(`window ${element.id} does not edit a document`);
      return uuid;
    });
  }

  /** Waits until the source value at `system.<path>` of the sheet's document equals `expected`. */
  private async waitForSource(path: string, expected: string, what: string) {
    const uuid = await this.sheetDocumentUuid();
    await expect.poll(() => systemValue(this.page, uuid, path, { source: true }), { message: what }).toBe(expected);
  }

  /** Types `value` into the sheet control of `field` and waits until the item stores it. */
  async setStat(field: string, value: string) {
    const path = fieldPath('setStat', ITEM_FIELDS, this.itemType, field);
    const control = this.sheet.locator(`[name="data.${path}"]`);
    await control.fill(value);
    await control.blur(); // the sheet submits on change, which fires when the control loses focus
    await this.waitForSource(path, value, `${this.itemType} ${field} is stored`);
  }

  /**
   * Asserts that the prepared `field` (see ITEM_FIELDS) of the item the sheet edits and the sheet
   * control showing it both equal `expected`. Read-only; an unsupported field throws.
   */
  async checkStat(field: string, expected: string, options: CheckOptions = {}) {
    const path = fieldPath('checkStat', ITEM_FIELDS, this.itemType, field);
    const uuid = await this.sheetDocumentUuid();
    await checkField(this.page, this.sheet, uuid, `${this.itemType} ${field}`, path, expected, options);
  }

  /** Every supported field's prepared value and control value, read without asserting. */
  async readFields(): Promise<Record<string, { document: string; control: string | null }>> {
    const uuid = await this.sheetDocumentUuid();
    const fields = ITEM_FIELDS[this.itemType] ?? {};
    const values: Record<string, { document: string; control: string | null }> = {};
    for (const [field, path] of Object.entries(fields)) {
      const control = this.sheet.locator(`[name="data.${path}"]`);
      values[field] = {
        document: await systemValue(this.page, uuid, path),
        control: (await control.count()) === 1 ? await control.inputValue() : null,
      };
    }
    return values;
  }

  /** The source data of the item the sheet edits and every control value of the sheet. */
  async snapshot() {
    return { source: await sourceData(this.page, await this.sheetDocumentUuid()), controls: await controlValues(this.sheet) };
  }

  /**
   * Waits until the attribute (modifier) list at `system.<listPath>` of the sheet's document holds a
   * modifier with these type, choice and value.
   */
  private async waitForModifier(listPath: string, modtype: string, mod: string, value: string) {
    const uuid = await this.sheetDocumentUuid();
    await expect.poll(() => this.page.evaluate(({ uuid, listPath, modtype, mod, value }) => {
      const attributes = foundry.utils.getProperty(fromUuidSync(uuid)?._source.system ?? {}, listPath) ?? {};
      return Object.values(attributes as Record<string, any>)
        .some((attribute) => attribute?.modtype === modtype && attribute?.mod === mod && String(attribute?.value) === value);
    }, { uuid, listPath, modtype, mod, value }), { message: `${modtype} ${mod} ${value} is stored in system.${listPath}` }).toBe(true);
  }

  /** Keys of the attribute (modifier) list at `system.<listPath>` of the sheet's document. */
  private async modifierKeys(listPath: string): Promise<string[]> {
    const uuid = await this.sheetDocumentUuid();
    return this.page.evaluate(({ uuid, listPath }) => Object.keys(foundry.utils.getProperty(fromUuidSync(uuid)?._source.system ?? {}, listPath) ?? {}), { uuid, listPath });
  }

  /** Adds a modifier to the item's own modifier list and waits until the item stores it. */
  async addDirectModifier(modifierType: string, modifier: string, modifierValue: string) {
    // this function fails if there's >1 mod on the same item, so be aware of this
    if (["forcepower", "signatureability", "specialization"].includes(this.itemType)) {
      const baseModifierButton = this.sheet.locator('.talent-action.hover .fa-cog');
      await baseModifierButton.click();
      const popout = this.page.locator('#popout-modifiers');
      await popout.locator('.attribute-control[data-action="create"]').click();
      const [modtype] = await popout.locator('.modtype').selectOption(modifierType);
      const [mod] = await popout.locator('.mod').selectOption(modifier);
      await popout.locator('.modvalue').fill(modifierValue);
      // Closing submits the pop-out first and resolves once the window is gone.
      await popout.getByRole('button', { name: 'Close Window' }).click();
      await expect(popout).toBeHidden();
      await this.waitForModifier('attributes', modtype, mod, modifierValue);
    } else {
      const keysBefore = await this.modifierKeys('attributes');
      await this.sheet.locator('.attributes-header .attribute-control[data-action="create"]').click();
      let key = '';
      await expect.poll(async () => {
        key = (await this.modifierKeys('attributes')).find((candidate) => !keysBefore.includes(candidate)) ?? '';
        return key;
      }, { message: 'a new modifier row is stored' }).not.toBe('');
      const row = this.sheet.locator(`li.attribute[data-attribute="${key}"]`);
      const [modtype] = await row.locator('.modtype').selectOption(modifierType);
      await this.waitForSource(`attributes.${key}.modtype`, modtype, `modifier type ${modtype} is stored`);
      const [mod] = await row.locator('.mod').selectOption(modifier);
      await this.waitForSource(`attributes.${key}.mod`, mod, `modifier ${mod} is stored`);
      const valueControl = row.locator('.modvalue');
      await valueControl.fill(modifierValue);
      await valueControl.blur(); // the sheet submits on change, which fires when the control loses focus
      await this.waitForSource(`attributes.${key}.value`, modifierValue, `modifier value ${modifierValue} is stored`);
    }
  }

  /** The key of the one row of the item's own modifier list with this type and choice. */
  private async modifierRowKey(modifierType: string, modifier: string): Promise<string> {
    const uuid = await this.sheetDocumentUuid();
    const keys = await this.page.evaluate(({ uuid, modifierType, modifier }) => {
      const attributes = fromUuidSync(uuid)?._source.system.attributes ?? {};
      return Object.keys(attributes).filter((key) => attributes[key]?.modtype === modifierType && attributes[key]?.mod === modifier);
    }, { uuid, modifierType, modifier });
    if (keys.length !== 1) throw new Error(`${this.name} has ${keys.length} ${modifierType} ${modifier} rows`);
    return keys[0];
  }

  /** The Enabled box of the item's own modifier row with this type and choice. */
  async modifierEnabledBox(modifierType: string, modifier: string): Promise<Locator> {
    const key = await this.modifierRowKey(modifierType, modifier);
    return this.sheet.locator(`li.attribute[data-attribute="${key}"] .attribute-effect-toggle`);
  }

  /**
   * Ticks or unticks the Enabled box of the item's own modifier row with this type and choice, and
   * waits until the row stores it (`active`) and the row's Active Effect follows.
   */
  async setModifierEnabled(modifierType: string, modifier: string, enabled: boolean) {
    const key = await this.modifierRowKey(modifierType, modifier);
    const box = await this.modifierEnabledBox(modifierType, modifier);
    await (enabled ? box.check() : box.uncheck());
    await this.waitForSource(`attributes.${key}.active`, String(enabled), `${modifierType} ${modifier} stores active ${enabled}`);
    const uuid = await this.sheetDocumentUuid();
    await expect.poll(
      () => this.page.evaluate(({ uuid, key }) => fromUuidSync(uuid)?.effects.find((effect) => effect.name === key)?.disabled ?? null, { uuid, key }),
      { message: `the effect of ${modifierType} ${modifier} follows the Enabled box` },
    ).toBe(!enabled);
  }

  /** Adds a modifier to talent/upgrade `talentNumber` of a tree item and waits until the item stores it. */
  async addTalentModifier(talentNumber: string, modifierType: string, modifier: string, modifierValue: string) {
    const node = `${this.upgradeName}${talentNumber}`;
    const list = `${this.upgradeName === 'upgrade' ? 'upgrades' : 'talents'}.${node}.attributes`;
    await this.sheet.locator(`[id="${node}"]`).locator('.fas.fa-cog').click();
    const editor = this.page.locator('.application.flat_editor');
    await editor.getByText('Base Mods').click();
    await editor.locator('.attribute-control[data-action="create"]').click();
    const [modtype] = await editor.locator('.modtype').selectOption(modifierType);
    const [mod] = await editor.locator('.mod').selectOption(modifier);
    await editor.locator('.modvalue').fill(modifierValue);
    // Closing submits the editor first and resolves once the window is gone.
    await editor.getByRole('button', { name: 'Close Window' }).click();
    await expect(editor).toBeHidden();
    await this.waitForModifier(list, modtype, mod, modifierValue);
  }

  /** Marks talent/upgrade `talentNumber` of a tree item learned and waits until the item stores it. */
  async learnTalent(talentNumber: string) {
    const node = `${this.upgradeName}${talentNumber}`;
    const group = this.upgradeName === 'upgrade' ? 'upgrades' : 'talents';
    await this.sheet.locator(`[id="${node}"]`).getByRole('checkbox').check();
    await this.waitForSource(`${group}.${node}.islearned`, 'true', `${node} is learned`);
  }

  /** Opens the editor of an item embedded in this one (an attachment or modification) and waits for it. */
  async editItem(item: Items) {
    await this.sheet.locator('.item').filter({ hasText: item.name }).locator('.item-edit').click();
    await expect(item.sheet).toBeVisible();
  }

  async setRank(rank: string) {
    await this.switchTab('configuration');
    const control = this.sheet.locator('input[name="data.rank"]');
    await control.fill(rank);
    await control.blur(); // the sheet submits on change, which fires when the control loses focus
    await this.waitForSource('rank', rank, `rank ${rank} is stored`);
    await this.switchTab('modifiers');
  }

  /** Ticks "installed" on modification `modNumber` in this window. */
  async enableMod(modNumber: string) {
    const installed = this.sheet.locator(`input[name="system.itemmodifier[${modNumber}].system.active"][type="checkbox"]`);
    await installed.check();
    await expect(installed).toBeChecked();
  }
}
