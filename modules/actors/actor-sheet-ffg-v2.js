import { ActorSheetFFG } from "./actor-sheet-ffg.js";

/**
 * @deprecated Collapsed alias of {@link ActorSheetFFG} (V2-full migration,
 * Stage 4.8). The former V1/V2 actor-sheet split is gone: both names now resolve
 * to the same native ApplicationV2 sheet, and the `v2` class / template /
 * dimensions / tabs / scrollY that used to live here are folded into
 * `ActorSheetFFG.DEFAULT_OPTIONS`.
 *
 * This empty alias is retained for ONE release so worlds whose actors carry
 * `flags.core.sheetClass === "ffg.ActorSheetFFGV2"` keep resolving without a
 * data migration. Its registration in `swffg-main.js` is kept (without
 * `makeDefault`) for the same reason. Remove both in the release after V2-full
 * lands. See docs/superpowers/plans/2026-05-31-v2-full-migration.md.
 */
export class ActorSheetFFGV2 extends ActorSheetFFG {}
