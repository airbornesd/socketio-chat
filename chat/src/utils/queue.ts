import { Queue } from 'bullmq';

export const messageQueue = new Queue('messageQueue', {
  connection: {
    host: 'localhost',
    port: 6379,
  },
});

export const addMessageToQueue = async (data: object) => {
  await messageQueue.add('processMessage', data);
};
