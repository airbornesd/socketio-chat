import jwt from 'jsonwebtoken';
import { IUser, logger } from 'shared';
import {
  ISocket,
  SocketCallback,
  ValidationCallback,
} from '../types/interfaces';

const secret = process.env.JWT_SECRET || '';

export const checkSocketAuth = (
  socket: ISocket,
  next: (err?: Error) => void
) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('authentication error: no token provided'));
    }

    const decoded = jwt.verify(token, secret) as { user: IUser };
    if (!decoded?.user) {
      return next(new Error('authentication error: user not found'));
    }

    socket.user = decoded.user;
    next();
  } catch (error) {
    next(new Error('authentication error: invalid token'));
  }
};

export const validateSocket = (
  user: string | undefined,
  callback: SocketCallback,
  operation: ValidationCallback
) => {
  if (!user) {
    return callback({
      success: false,
      message: 'unauthorized: user not authenticated',
    });
  }

  try {
    operation();
  } catch (error: any) {
    logger.error('socket operation failed:', error);
    callback({
      success: false,
      message: error.message || 'operation failed',
    });
  }
};
