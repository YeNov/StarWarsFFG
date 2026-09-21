/**
 * Replace an existing Actor with a newly-created document.
 *
 * Reuse the document id so linked scene tokens continue pointing at the character,
 * and carry over who owns it and which folder it sits in, so a GM overriding a
 * player's character does not lock the player out. Every other field comes from the
 * newly imported source. If creation fails after deletion, restore the old Actor
 * source and surface the original failure.
 */
export async function replaceActor(existing, actorData, createActor) {
  const previousSource = existing.toObject();
  const replacementSource = { ...actorData, _id: existing.id };
  if (previousSource.ownership) replacementSource.ownership = { ...previousSource.ownership };
  if (previousSource.folder !== undefined) replacementSource.folder = previousSource.folder;
  await existing.delete();
  try {
    return await createActor(replacementSource, { keepId: true });
  } catch (error) {
    try {
      await createActor(previousSource, { keepId: true });
    } catch {
      // Preserve the original creation failure; the caller will report it.
    }
    throw error;
  }
}
