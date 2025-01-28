import { NextFunction, Request, Response } from 'express';
import { Schema, ValidationOptions } from 'joi';

export const cors = (options = {}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method.toLowerCase() === 'options') {
      return res.sendStatus(204);
    }
    next();
  };
};

export const sendResponse = (
  res: any,
  statusCode: number,
  message: string,
  data: any = null,
  errors: any = null
) => {
  return res.status(statusCode).json({
    status: statusCode,
    message: message || 'success',
    data,
    errors,
  });
};

declare interface IValidationOptions extends ValidationOptions {
  field?: keyof Request;
}

export const validate = (schema: Schema, options: IValidationOptions = {}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const target = options.field ? req[options.field] : req.body;

    const { value, error } = schema.validate(target, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true,
      errors: {
        wrap: {
          label: '',
        },
      },
      ...options,
    });

    if (error) {
      const errors = error.details.reduce(
        (prev, cur) => ({
          ...prev,
          [cur.context?.key || 'error']: cur.message,
        }),
        {} as Record<string, string | null>
      );
      errors.error = error.message;

      console.error(errors);
      return sendResponse(res, 422, 'Validation error', null, errors);
    }

    if (options.field) {
      (req[options.field] as any) = value;
    } else {
      req.body = value;
    }

    next();
  };
};
