import { mix, BaseItemDataModel } from "../../mix.js";
import { MetaOnlyTemplate } from "../../shared-fields.js";

/**
 * `homesteadupgrade` — template.json `templates: ["meta_only"]`. Metadata only,
 * no description/attributes and no own fields.
 */
export class HomesteadUpgradeDataModel extends mix(BaseItemDataModel, MetaOnlyTemplate) {}
