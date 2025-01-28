import jwt from 'jsonwebtoken';
import { ITokenPayload } from '../types/interfaces.js';

const secret = process.env.JWT_SECRET || '';

export const generateToken = (payload: ITokenPayload) => {
  const accessToken = jwt.sign(payload, secret, {
    expiresIn: '365d',
  });

  return { accessToken };
};
