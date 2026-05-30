import { FFGDocumentSheetV2 } from "./document-sheet-v2-compat.js";

export class ItemSheetV2Compat extends FFGDocumentSheetV2 {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/sheets/item-sheet.html",
      width: 500,
      closeOnSubmit: false,
      submitOnClose: true,
      submitOnChange: true,
      resizable: true,
      baseApplication: "ItemSheet",
      id: "item",
      secrets: [{ parentSelector: ".editor" }],
    });
  }

  get title() {
    return this.item.name;
  }

  get item() {
    return this.object;
  }

  get actor() {
    return this.item.actor;
  }

  get isEditable() {
    return super.isEditable && !this.item.flags?.readonly;
  }

  getData(options = {}) {
    const data = super.getData(options);
    data.item = data.document;
    return data;
  }

  _getLegacyRootClasses(context = {}) {
    const classes = super._getLegacyRootClasses(context);
    const sheetClass = {
      armour: "item-sheet-armor",
      shipweapon: "item-sheet-vehicle-weapon",
      shipattachment: "item-sheet-vehicle-attachment",
      itemmodifier: "item-sheet-modifiers",
      ability: "item-sheet-talent",
      criticaldamage: "item-sheet-criticalinjury",
    }[this.item.type] ?? `item-sheet-${this.item.type}`;

    classes.push(sheetClass);
    return classes;
  }
}
