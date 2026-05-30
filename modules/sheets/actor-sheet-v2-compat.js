import { FFGDocumentSheetV2 } from "./document-sheet-v2-compat.js";

export class ActorSheetV2Compat extends FFGDocumentSheetV2 {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      height: 720,
      width: 800,
      template: "templates/sheets/actor-sheet.html",
      closeOnSubmit: false,
      submitOnClose: true,
      submitOnChange: true,
      resizable: true,
      baseApplication: "ActorSheet",
      dragDrop: [{ dragSelector: ".item-list .item" }],
      secrets: [{ parentSelector: ".editor" }],
      token: null,
    });
  }

  get title() {
    if (!this.actor.isToken) return this.actor.name;
    return `[${game.i18n.localize(TokenDocument.metadata.label)}] ${this.actor.name}`;
  }

  get actor() {
    return this.object;
  }

  get token() {
    return this.object.token || this._token || null;
  }

  async close(options = {}) {
    this._token = null;
    return super.close(options);
  }

  getData(options = {}) {
    const context = super.getData(options);
    context.actor = this.object;
    context.items = context.data.items;
    context.items.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.effects = context.data.effects;
    return context;
  }

  _getSubmitData(updateData = {}) {
    const data = super._getSubmitData(updateData);
    const overrides = foundry.utils.flattenObject(this.actor.overrides);
    for (const k of Object.keys(overrides)) delete data[k];
    return data;
  }

  _canDragStart(_selector) {
    return this.isEditable;
  }

  _canDragDrop(_selector) {
    return this.isEditable;
  }

  _onDragStart(event) {
    const li = event.currentTarget;
    if ("link" in event.target.dataset) return;

    let dragData;
    if (li.dataset.itemId) {
      const item = this.actor.items.get(li.dataset.itemId);
      dragData = item?.toDragData();
    }
    if (li.dataset.effectId) {
      const effect = this.actor.effects.get(li.dataset.effectId);
      dragData = effect?.toDragData();
    }
    if (!dragData) return;

    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const actor = this.actor;
    const allowed = Hooks.call("dropActorSheetData", actor, this, data);
    if (allowed === false) return;

    switch (data.type) {
      case "ActiveEffect":
        return this._onDropActiveEffect(event, data);
      case "Actor":
        return this._onDropActor(event, data);
      case "Item":
        return this._onDropItem(event, data);
      case "Folder":
        return this._onDropFolder(event, data);
      default:
        return undefined;
    }
  }

  async _onDropActiveEffect(_event, data) {
    const effect = await ActiveEffect.implementation.fromDropData(data);
    if (!this.actor.isOwner || !effect) return false;
    if (effect.target === this.actor) return false;
    return ActiveEffect.implementation.create(effect.toObject(), { parent: this.actor });
  }

  async _onDropActor(_event, _data) {
    if (!this.actor.isOwner) return false;
    return false;
  }

  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    const itemData = item.toObject();

    if (this.actor.uuid === item.parent?.uuid) return this._onSortItem(event, itemData);
    return this._onDropItemCreate(itemData, event);
  }

  async _onDropFolder(event, data) {
    if (!this.actor.isOwner) return [];
    const folder = await Folder.implementation.fromDropData(data);
    if (folder.type !== "Item") return [];
    const droppedItemData = await Promise.all(folder.contents.map(async (item) => {
      if (!(item instanceof Item)) item = await foundry.utils.fromUuid(item.uuid);
      return item.toObject();
    }));
    return this._onDropItemCreate(droppedItemData, event);
  }

  async _onDropItemCreate(itemData, _event) {
    itemData = Array.isArray(itemData) ? itemData : [itemData];
    return this.actor.createEmbeddedDocuments("Item", itemData);
  }

  _onSortItem(event, itemData) {
    const items = this.actor.items;
    const source = items.get(itemData._id);
    const dropTarget = event.target.closest("[data-item-id]");
    if (!dropTarget) return;
    const target = items.get(dropTarget.dataset.itemId);
    if (!source || !target || source.id === target.id) return;

    const siblings = [];
    for (const el of dropTarget.parentElement.children) {
      const siblingId = el.dataset.itemId;
      if (siblingId && (siblingId !== source.id)) siblings.push(items.get(el.dataset.itemId));
    }

    const sortUpdates = foundry.utils.performIntegerSort(source, { target, siblings });
    const updateData = sortUpdates.map((u) => {
      const update = u.update;
      update._id = u.target._id;
      return update;
    });

    return this.actor.updateEmbeddedDocuments("Item", updateData);
  }
}
