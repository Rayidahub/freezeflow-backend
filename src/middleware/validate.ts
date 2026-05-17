// src/middleware/validate.ts
// express-validator result checker middleware

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { sendError } from '../utils/response';

/**
 * Runs after express-validator chains.
 * Returns 422 with all validation errors if any exist.
 */
export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg as string);
    sendError(res, 'Validation failed', 422, messages);
    return;
  }

  next();
}
