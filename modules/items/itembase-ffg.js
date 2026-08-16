import ItemHelpers from "../helpers/item-helpers.js";

export default class ItemBaseFFG extends Item {
  async update(data, options = {}) {
    // Carry clickfromparent across updates that don't mention it. This must be
    // written as a dotted key: assigning a whole `flags` object here would be
    // applied after any dotted `flags.*` entry already in the same update and
    // replace it wholesale, silently discarding the caller's flag change.
    const setsClickFromParent = typeof data.flags?.clickfromparent !== "undefined"
      || typeof data["flags.clickfromparent"] !== "undefined";
    if (!Object.keys(data).includes("ownership") && !setsClickFromParent && typeof this.flags?.clickfromparent !== "undefined") {
      data["flags.clickfromparent"] = this.flags.clickfromparent;
    }
    return super.update(ItemHelpers.normalizeDataStructure(data), options);
  }
}
