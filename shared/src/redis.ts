import { createClient } from 'redis';
import logger from './logger.js';

const redis = createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
});

export const redisPubClient = redis.duplicate();
export const redisSubClient = redis.duplicate();

export const connectRedis = async () => {
  await Promise.all([
    redis.connect(),
    redisPubClient.connect(),
    redisSubClient.connect(),
  ]);

  logger.info('redis connected');
};

redis.on('error', logger.error);

export default redis;
