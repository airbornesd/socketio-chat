import mongoose from 'mongoose';
import logger from './logger.js';

const url = process.env.MONGO_URI || '';

mongoose.set('strictQuery', true);
mongoose.set('id', false);
mongoose.set('toJSON', { getters: true, versionKey: false });

mongoose.set('debug', process.env.NODE_ENV !== 'production');

mongoose.connection.on('error', (err) => {
  console.error(err);
});

export const connectDb = async () => {
  await mongoose.connect(url, { dbName: 'chat' });
  logger.info('mongodb connected');
};
