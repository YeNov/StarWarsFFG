/**
 * Concrete Item System Data Model classes. Each composes `BaseItemDataModel`
 * with the template mixins its type lists in template.json's `templates` array,
 * plus any type-specific fields. Registered into `CONFIG.Item.dataModels` by
 * ./index.js as stages land.
 *
 * Stage 1 (proof of concept): the two simplest types, both with no own fields.
 */

import { mix, BaseItemDataModel } from "./mix.js";
import { MetaOnlyTemplate } from "./shared-fields.js";
import { CoreTemplate } from "./item-templates.js";

/**
 * `homesteadupgrade` — template.json `templates: ["meta_only"]`. Metadata only,
 * no description/attributes and no own fields.
 */
export class HomesteadUpgradeDataModel extends mix(BaseItemDataModel, MetaOnlyTemplate) {}

/**
 * `ability` — template.json `templates: ["core"]`. Description + freeform
 * attributes + metadata, no own fields.
 */
export class AbilityDataModel extends mix(BaseItemDataModel, CoreTemplate) {}
