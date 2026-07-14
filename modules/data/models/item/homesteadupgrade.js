import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate } from "../../item-templates.js";

/**
 * `homesteadupgrade` — template.json declares `templates: ["meta_only"]`, but
 * that never matched the sheet: ffg-homesteadupgrade-sheet.html binds a
 * ProseMirror `system.description` editor, the shared modifiers partial
 * (`system.attributes`), `data.price.value` and `data.rarity.isrestricted`.
 * Under template.json those keys persisted anyway (schemaless), so the sheet
 * worked; a `meta_only` model prunes them and the whole sheet goes dead.
 *
 * `CoreTemplate` supplies description + attributes + metadata. `price`/`rarity`
 * are declared here rather than by mixing in `BasicTemplate`, because these
 * items never carried `quantity`/`encumbrance` — pulling in the full template
 * would invent fields the type has never had.
 */
export class HomesteadUpgradeDataModel extends mix(BaseItemDataModel, CoreTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    const num = (initial = 0) => new f.NumberField({ initial });
    const str = (initial) => new f.StringField({ initial });
    return {
      ...super.defineSchema(),
      price: new f.SchemaField({
        value: num(),
        type: str("Number"),
        label: str("Price"),
        adjusted: num(),
      }),
      rarity: new f.SchemaField({
        value: num(),
        isrestricted: new f.BooleanField({ initial: false }),
        type: str("Number"),
        label: str("Rarity"),
        adjusted: num(),
      }),
    };
  }
}
