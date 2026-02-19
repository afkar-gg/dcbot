function createChatOrchestrator({ execute, onError } = {}) {
  if (typeof execute !== 'function') {
    throw new Error('createChatOrchestrator requires an execute function');
  }

  return async function run(message, context = {}) {
    try {
      return await execute(message, context);
    } catch (err) {
      if (typeof onError === 'function') {
        try {
          await onError(err, { message, context });
        } catch {
          // ignore logging handler failures
        }
      }
      throw err;
    }
  };
}

module.exports = {
  createChatOrchestrator,
};
