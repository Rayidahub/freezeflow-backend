// src/middleware/errorHandler.ts
// Global Express error handling middleware

import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Central error handler — catches all errors passed via next(error).
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const message =
    err.isOperational
      ? err.message
      : process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message;

  console.error(`[ERROR] ${req.method} ${req.path}`, {
    message: err.message,
    stack: err.stack,
    statusCode,
  });

  sendError(res, message, statusCode);
}

/**
 * 404 handler — catches unmatched routes.
 */
export function notFound(req: Request, res: Response): void {
  sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

/**
 * Create an operational error (expected, safe to show to client).
 */
export function createError(message: string, statusCode = 400): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
}
