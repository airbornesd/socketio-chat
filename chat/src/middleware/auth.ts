import { NextFunction, Response } from 'express';
import { IRequest, ITokenPayload } from '../types/interfaces';
import { sendResponse, User } from 'shared';
import jwt from 'jsonwebtoken';

export const checkAuth = async (
  req: IRequest,
  res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization;
  if (!header) return sendResponse(res, 401, 'authorization is required');

  const token = header.split(' ')[1];
  if (!token) return sendResponse(res, 401, 'access token required');

  const [error, decoded] = verifyToken<ITokenPayload>(
    token,
    process.env.JWT_SECRET || ''
  );

  if (error) {
    const errMessage =
      error.name === 'TokenExpiredError'
        ? 'access token expired'
        : 'invalid access token';

    return sendResponse(res, 401, errMessage);
  }

  if (!decoded || !decoded._id) {
    return sendResponse(res, 401, 'please login first');
  }

  const user = await User.findById(decoded._id).select('-password');

  if (!user || !user.role) {
    return sendResponse(res, 404, 'user or role not found!');
  }

  req.user = user;

  next();
};

export const verifyToken = <T>(
  token: string,
  secret: string
): [null | Error, T | null] => {
  try {
    const decoded = jwt.verify(token, secret) as T;
    return [null, decoded];
  } catch (err) {
    return [err as Error, null];
  }
};
