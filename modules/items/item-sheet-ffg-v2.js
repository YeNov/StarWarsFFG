import { ItemSheetFFG } from "./item-sheet-ffg.js";

export class ItemSheetFFGV2 extends ItemSheetFFG {
  /** @override */
  static get defaultOptions() {
    const options = foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["starwarsffg", "sheet", "item", "v2"],
      scrollY: [".sheet-body", ".tab"],
    });
    options.tabs = [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }];
    return options;
  }

  getData() {
    const data = super.getData();
    return data;
  }
}
