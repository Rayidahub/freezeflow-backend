// src/middleware/customerAuth.ts
// Middleware for customer-facing protected routes.
// Customers get their own JWT with type:'customer' so staff tokens
// cannot be used on customer endpoints and vice versa.

import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { sendError } from '../utils/response';
import { CustomerJwtPayload } from '../types';

/**
 * requireCustomer — verifies a customer JWT.
 * Attaches decoded payload to req.customer on success.
 */
export function requireCustomer(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 'Unauthorised – no token provided', 401);
      return;
    }

    const token   = authHeader.split(' ')[1];
    const decoded = verifyToken(token) as unknown as CustomerJwtPayload;

    // Ensure this is a customer token, not a staff token
    if (decoded.type !== 'customer') {
      sendError(res, 'Unauthorised – invalid token type', 401);
      return;
    }

    req.customer = decoded;
    next();
  } catch {
    sendError(res, 'Unauthorised – invalid or expired token', 401);
  }
}

/**
 * optionalCustomer — attaches customer if token present, but doesn't block.
 * Used on product listing so guests can browse too.
 */
export function optionalCustomer(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token   = authHeader.split(' ')[1];
      const decoded = verifyToken(token) as unknown as CustomerJwtPayload;
      if (decoded.type === 'customer') req.customer = decoded;
    }
  } catch {
    // ignore — optional
  }
  next();
}
