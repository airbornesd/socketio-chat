import { connectDb, connectRedis, logger } from 'shared';

export const boot = async () => {
  await connectDb();
  await connectRedis();

  logger.info('booted successfully');
};
