/**
 * The pure build-dependency factory (DEV-16, §0.6.5).
 *
 * Covered — imports NOTHING. All four collaborators arrive as parameters, so the
 * adapter that binds the real tree materializer into toItemData is itself Node-tested
 * rather than hand-written at the untestable composition root (pc-wizard.js).
 */

/** Thrown when a required collaborator is missing or not callable. */
export class MissingCollaboratorError extends Error {
  constructor(name) {
    super(`build dependency "${name}" is missing or not a function`);
    this.name = "MissingCollaboratorError";
    this.collaborator = name;
  }
}

/**
 * Assemble the dependency bundle applyBuild consumes.
 *  - creationDefaults = getActorCreationDefaults("character")
 *  - applyCharacteristicDeltas is threaded through unchanged
 *  - the returned toItemData adapter ALWAYS binds materializeTreePurchases as
 *    `materializeTree`; a caller-supplied `materializeTree` option cannot override it.
 *
 * @param {object} collaborators
 * @param {Function} collaborators.getActorCreationDefaults
 * @param {Function} collaborators.applyCharacteristicDeltas
 * @param {Function} collaborators.materializeTreePurchases
 * @param {Function} collaborators.toItemData
 * @returns {{creationDefaults: object, applyCharacteristicDeltas: Function, toItemData: Function}}
 */
export function makeBuildDependencies({
  getActorCreationDefaults,
  applyCharacteristicDeltas,
  materializeTreePurchases,
  toItemData,
}) {
  const collaborators = { getActorCreationDefaults, applyCharacteristicDeltas, materializeTreePurchases, toItemData };
  for (const [name, fn] of Object.entries(collaborators)) {
    if (typeof fn !== "function") throw new MissingCollaboratorError(name);
  }

  return {
    creationDefaults: getActorCreationDefaults("character"),
    applyCharacteristicDeltas,
    // materializeTree wins over any caller-supplied option — the binding is not overridable.
    toItemData: (ref, options = {}) =>
      toItemData(ref, { ...options, materializeTree: materializeTreePurchases }),
  };
}
