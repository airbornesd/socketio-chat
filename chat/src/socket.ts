import { createAdapter } from '@socket.io/redis-adapter';
import { Server as IServer } from 'http';
import {
  redis,
  redisSubClient,
  logger,
  Message,
  Chat,
  redisPubClient,
  connectRedis,
} from 'shared';
import { Server } from 'socket.io';
import { checkSocketAuth } from './middleware/socket.js';
import { ISocket } from './types/interfaces.js';
import { instrument } from '@socket.io/admin-ui';
import {
  BATCH_FLUSH_INTERVAL,
  flush,
  MESSAGE_BATCH_SIZE,
  OFFLINE_MESSAGE_EXPIRY,
  retry,
} from './utils/socket.js';
import { Types } from 'mongoose';

let io: Server;
const onlineUsers = new Map<string, Set<string>>();
const messageQueue = new Map<string, NodeJS.Timeout>();

export const getIo = () => {
  if (!io) {
    throw new Error('socket.io not initialized');
  }
  return io;
};

export const initSocket = (server: IServer) => {
  io = new Server(server, {
    cors: {
      origin: [
        'http://127.0.0.1:5501',
        'http://localhost:5501',
        'https://admin.socket.io/',
      ],
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  try {
    connectRedis();
    io.adapter(createAdapter(redisPubClient, redisSubClient));
  } catch (err) {
    logger.error('Error connecting to Redis:', err);
  }

  io.engine.on('connection_error', (err) => {
    console.log('Connection Error:', err);
  });

  instrument(io, {
    auth: false,
    mode: 'development',
  });

  io.use(checkSocketAuth);

  io.on('connection', (socket: ISocket) => {
    const user = socket.user;

    if (!user) return socket.disconnect();

    logger.info(`new socket connection: ${socket.id}`);

    socket.join(user);

    if (!onlineUsers.has(user)) onlineUsers.set(user, new Set());
    onlineUsers.get(user)?.add(socket.id);

    (async () => {
      try {
        const offlineQueueKey = `offline_messages:${user}`;
        const offlineMessages = await redis.lRange(offlineQueueKey, 0, -1);

        if (offlineMessages.length > 0) {
          const messages = offlineMessages.map((msg) => JSON.parse(msg));
          socket.emit('offline_messages', messages);
          await redis.del(offlineQueueKey);
        }
      } catch (error) {
        logger.error('error processing offline messages:', error);
      }
    })();

    io.emit('user_status', { userId: user, isOnline: true });

    socket.on('user_connected', async (data) => {
      if (!user) return { success: false, message: 'unauthorized' };

      try {
        const cacheKey = `user:${user}:chats`;
        const cachedChats = await redis.get(cacheKey);

        let chats;
        if (cachedChats) {
          chats = JSON.parse(cachedChats);
        } else {
          chats = await Chat.find({ members: user })
            .sort({ updatedAt: -1 })
            .populate('members', 'username')
            .lean()
            .exec();

          const data = await Promise.all(
            chats.map(async (chat) => {
              const messages = await Message.find({ chatId: chat._id })
                .sort({ createdAt: -1 })
                .populate('userId', 'username')
                .lean();

              return {
                chat,
                messages,
              };
            })
          );

          chats = data;
          await redis.setEx(cacheKey, 300, JSON.stringify(chats));
        }

        io.to(user).emit('login', { chats });
      } catch (error) {
        logger.error('error fetching user chats:', error);
        socket.emit('error', {
          message: 'failed to fetch user chats',
        });
      }
    });

    socket.on('send_message', async (data) => {
      if (!user) return { success: false, message: 'unauthorized' };

      try {
        const { chatId, text } = data;

        const chat = await retry(async () =>
          Chat.findOne({
            _id: chatId,
            members: { $in: user },
          })
        );

        if (!chat) return { success: false, message: 'chat not found' };

        const message = await Message.create({
          content: text.trim(),
          userId: user,
          chatId: chat._id,
        });

        const batchKey = `message_batch:${chatId}`;
        await redis.rPush(batchKey, JSON.stringify(message));

        if (!messageQueue.has(chatId)) {
          const timeoutId = setTimeout(async () => {
            await flush(chatId);
            messageQueue.delete(chatId);
          }, BATCH_FLUSH_INTERVAL);

          messageQueue.set(chatId, timeoutId);
        }

        if ((await redis.lLen(batchKey)) >= MESSAGE_BATCH_SIZE) {
          clearTimeout(messageQueue.get(chatId));
          messageQueue.delete(chatId);
          await flush(chatId);
        }

        await Promise.all([
          Chat.updateOne(
            { _id: chatId },
            {
              $set: {
                updatedAt: new Date(),
                lastMessage: message._id,
              },
            }
          ),
          ...chat.members.map((memberId: string | Types.ObjectId) =>
            redis.del(`user:${memberId}:chats`)
          ),
        ]);

        const populate = await Message.findById(message._id)
          .populate('userId', 'username')
          .lean();

        for (const memberId of chat.members) {
          const memberIdStr = memberId.toString();
          if (onlineUsers.has(memberIdStr)) {
            io.to(memberIdStr).emit('receive_message', {
              chatId,
              data: populate,
              userId: memberIdStr,
              recipients: chat.members,
            });
          } else {
            const offlineQueueKey = `offline_messages:${memberIdStr}`;
            await redis.lPush(
              offlineQueueKey,
              JSON.stringify({
                type: 'message',
                chatId,
                data: populate,
                timestamp: Date.now(),
              })
            );
            await redis.expire(offlineQueueKey, OFFLINE_MESSAGE_EXPIRY);
          }
        }

        return { success: true, data: populate };
      } catch (error) {
        logger.error('error in sendMessage:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'error occurred',
        };
      }
    });

    socket.on('read_message', async (data) => {
      if (!user) return { success: false, message: 'unauthorized' };

      try {
        const { chatId } = data;

        const chat = await Chat.findOne({
          _id: chatId,
          members: user,
        }).lean();

        if (!chat) return { success: false, message: 'chat not found' };

        await Message.updateMany(
          { chatId, readBy: { $ne: user } },
          { $addToSet: { readBy: user } }
        );

        const messages = await Message.find({ chatId, readBy: user })
          .populate('userId', 'username')
          .lean();

        chat.members.forEach((memberId) => {
          io.to(memberId.toString()).emit('message_read', {
            chatId,
            userId: memberId.toString(),
            messages,
            recipients: chat.members,
          });
        });

        ({ success: true, data: messages });
      } catch (error) {
        logger.error('error in readMessage:', error);
        ({
          success: false,
          message: error instanceof Error ? error.message : 'error occurred',
        });
      }
    });

    socket.on('typing_status', async (data) => {
      if (!user) return { success: false, message: 'unauthorized' };

      try {
        const { chatId, isTyping } = data;

        const chat = await Chat.findOne({
          _id: chatId,
          members: user,
        }).lean();

        if (!chat) return { success: false, message: 'chat not found' };

        chat.members.forEach((memberId) => {
          if (memberId.toString() !== user) {
            io.to(memberId.toString()).emit('user_typing', {
              userId: user,
              chatId,
              isTyping,
            });
          }
        });

        return { success: true };
      } catch (error) {
        logger.error('error in typing status:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'error occurred',
        };
      }
    });

    socket.on('disconnect', () => {
      try {
        const userSockets = onlineUsers.get(user);

        if (userSockets) {
          userSockets.delete(socket.id);
          logger.info(`socket ${socket.id} disconnected for user ${user}`);

          if (userSockets.size === 0) {
            onlineUsers.delete(user);
            io.emit('user_status', { userId: user, isOnline: false });
            logger.info(`user ${user} went offline (all sockets disconnected)`);
          }
        }
      } catch (error) {
        logger.error('error in disconnect handler:', error);
      }
    });
  });

  return io;
};
