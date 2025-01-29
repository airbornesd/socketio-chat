import { createClient } from 'redis';
import logger from './logger.js';

export const redis = createClient({
  url: 'redis://localhost:6379', // adjust URL as needed
});

export const redisPubClient = redis.duplicate();
export const redisSubClient = redis.duplicate();

let isConnected = false;

export const connectRedis = async () => {
  if (isConnected) {
    logger.info('Redis already connected');
    return;
  }

  try {
    await Promise.all([
      redis.connect(),
      redisPubClient.connect(),
      redisSubClient.connect(),
    ]);

    isConnected = true;
    logger.info('Redis connected');
  } catch (error) {
    logger.error('Redis connection error:', error);
    throw error;
  }
};

redis.on('error', (err) => {
  logger.error('Redis error:', err);
  isConnected = false;
});

export default redis;
