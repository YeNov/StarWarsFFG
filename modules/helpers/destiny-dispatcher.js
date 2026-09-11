/** Preserve tracker permissions while forwarding every GM's controls to one writer. */
function prepareRequest(request, user) {
  if (!user) return null;
  const requestedBy = user.id;
  switch (request?.type) {
    case "destiny-flip":
      return { type: request.type, from: request.from, to: request.to, requestedBy };
    case "destiny-adjust":
      return user.isGM ? { type: request.type, pool: request.pool, delta: request.delta, requestedBy } : null;
    case "destiny-roll":
      // Player rolls still use the tracker's existing roll-permission handshake.
      // GM rolls never stamp a player's "has rolled" setting.
      return user.isGM ? { type: request.type, light: request.light, dark: request.dark, requestedBy } : null;
    case "destiny-reset":
      return user.isGM ? { type: request.type, requestedBy } : null;
    default:
      return null;
  }
}

/**
 * Route tracker flips and GM adjustments/rolls through the active GM's queue.
 * Transport, user lookup and the queue are injected for multi-client tests.
 * A forwarded submit means sent, not acknowledged; the queue's result callback
 * announces the outcome on the writer after processing it.
 */
export function createDestinyDispatcher({ getUser, getActiveGM, findUser, queue, send, onNoGM }) {
  return {
    async submit(request) {
      const user = getUser();
      const operation = prepareRequest(request, user);
      if (!operation) return false;
      const gm = getActiveGM();
      if (!gm) {
        onNoGM();
        return false;
      }
      if (user.id === gm.id) await queue.submit(operation);
      else await send({ destinyRequest: operation });
      return true;
    },

    async receive(data, senderId) {
      if (getUser().id !== getActiveGM()?.id) return;
      // Keep older clients/macros working through the same policy and queue.
      const request = data?.destinyRequest ?? (data?.destinyFlip
        ? { type: "destiny-flip", from: data.destinyFlip.from, to: data.destinyFlip.to } : null);
      const operation = prepareRequest(request, findUser(senderId));
      if (operation) await queue.submit(operation);
    },
  };
}
