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

  getData(options = {}) {
    const data = super.getData(options);
    data.item = data.document;
    return data;
  }
}
