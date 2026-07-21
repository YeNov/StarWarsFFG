/**
 * In-memory preview engine (D2, issue A).
 *
 * NOT Covered and outside the rule-7 closure — it constructs a live (unsaved) Actor
 * document, which needs CONFIG.Actor.documentClass and a ready world. It imports only
 * non-poisoned Covered modules (apply-build.js, build-item-schema.js) and consumes its
 * build dependencies by INJECTION (DEV-16) — it is NOT a composition root; pc-wizard.js
 * is the single root that assembles buildDeps. Verified live at Stage 23.
 *
 * The legacy wizard deleted and recreated a DB actor on every keystroke (the "trillion
 * temp actors" bug). This constructs an UNSAVED in-memory actor instead:
 *  - Preview actors are constructed only at/after `ready`. CONSTRUCTION IS PREPARATION.
 *  - Never call prepareData() a second time on a preview actor; if ever needed, reset()
 *    must precede it.
 *  - Each render builds a FRESH actor (with identical deterministic ids) and discards
 *    the previous one.
 *  - Zero DB writes, zero socket traffic, zero orphan actors, zero flicker while editing.
 *    The `temp actor - <user>` mechanism and its deleteCharacter cleanup have NO successor.
 */

import { applyBuild } from "./apply-build.js";
import { assignWizardIdentity } from "./build-item-schema.js";

/**
 * Build an unsaved preview Actor from the current draft.
 * @param {object} data       the wizard state
 * @param {object} buildDeps  the injected dependency bundle from makeBuildDependencies()
 * @returns {Promise<{previewActor: object, warnings: string[]}>}
 */
export async function buildPreviewActor(data, buildDeps) {
  const { actorData, warnings } = applyBuild(data, buildDeps);
  await assignWizardIdentity(actorData, { userId: game.user.id, commitId: data.commitId });

  // UNSAVED — construction runs the full data-preparation pipeline. NEVER .create().
  const previewActor = new CONFIG.Actor.documentClass(actorData);

  return { previewActor, warnings };
}
