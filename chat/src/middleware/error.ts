import { NextFunction, Request, Response } from 'express';
import { logger, sendResponse } from 'shared';

export const errorMiddleware = (
  err: any,
  _req: Request,
  res: Response,
  _next?: NextFunction
) => {
  if (err.code === 11000)
    return sendResponse(
      res,
      400,
      `${Object.keys(err.keyPattern)[0]} already exist`,
      null,
      err
    );

  logger.error(err);
  sendResponse(res, 500, 'internal error', null, err.message);
};

export const notFoundMiddleware = (_req: Request, res: Response) => {
  sendResponse(res, 400, 'route not found');
};
