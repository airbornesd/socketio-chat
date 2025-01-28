import { createAdapter } from '@socket.io/redis-adapter';
import { Server as IServer } from 'http';
import { redis, redisSubClient } from 'shared';
import { Server } from 'socket.io';
import { checkSocketAuth, validateSocket } from '../middleware/socket.js';
import { ISocket } from '../types/interfaces.js';
import * as service from '../services/socket.js';

let io: Server;
const onlineUsers = new Map();

export const getIO = () => {
  if (!io) {
    throw new Error('socket.io not initialized');
  }
  return io;
};

export const initSocket = (server: IServer) => {
  if (io) {
    return io;
  }

  io = new Server(server, {
    adapter: createAdapter(redis, redisSubClient),
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use(checkSocketAuth);

  io.on('connection', (socket: ISocket) => {
    const user = socket.user?._id.toString();

    if (!user) return socket.disconnect();

    socket.join(user);

    if (!onlineUsers.has(user)) onlineUsers.set(user, new Set());

    socket.on('user_connected', (data, callback) => {
      validateSocket(user, callback, async () => {
        try {
          const response = await service.getUserChats(user);
          if (response.success) {
            io.to(user).emit('user_connected', response.data);
          }
        } catch (error) {
          socket.emit('error', {
            message: 'failed to fetch user chats',
          });
        }
      });
    });

    socket.on('send_message', (data, callback) => {
      validateSocket(user, callback, () => {
        const next = service.socketResponse(callback, 'receive_message');
        return service.sendMessage(data, user, next);
      });
    });

    socket.on('read_message', (data, callback) => {
      validateSocket(user, callback, () => {
        const next = service.socketResponse(callback, 'message_read');
        return service.readMessage(data, user, next);
      });
    });

    socket.on('disconnect', () => {
      const userSockets = onlineUsers.get(user);

      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(user);
        }
      }
    });
  });

  return io;
};
