import { logger, Message, redis } from 'shared';

export const MAX_RETRIES = 3;
export const RETRY_DELAY = 1000;
export const OFFLINE_MESSAGE_EXPIRY = 60 * 60 * 24; // 24 hours
export const MESSAGE_BATCH_SIZE = 50;
export const BATCH_FLUSH_INTERVAL = 5000; // 5 seconds
export const CLEANUP_INTERVAL = 1000 * 60 * 15; // Run cleanup every 15 minutes
export const BATCH_CLEANUP_GRACE_PERIOD = 1000 * 60 * 60; // 1 hour
export const MAX_OFFLINE_MESSAGES = 100; // Maximum messages per user
export const MAX_BATCH_AGE = 1000 * 60 * 60; // 1 hour

export const retry = async (
  operation: () => Promise<any>,
  retries = MAX_RETRIES
): Promise<any> => {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return retry(operation, retries - 1);
    }
    throw error;
  }
};

export const flush = async (chatId: string) => {
  const batchKey = `message_batch:${chatId}`;
  try {
    const messages = await redis.lRange(batchKey, 0, -1);
    if (messages.length > 0) {
      await Message.insertMany(messages.map((msg) => JSON.parse(msg)));
      await redis.del(batchKey);
    }
  } catch (error) {
    logger.error('error flushing message batch:', error);
  }
};
