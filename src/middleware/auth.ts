// src/middleware/auth.ts
// Middleware to verify JWT tokens on protected routes

import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { sendError } from '../utils/response';
import { UserRole } from '../types';

/**
 * requireAuth — verifies the JWT in the Authorization header.
 * Attaches the decoded payload to req.user on success.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 'Unauthorised – no token provided', 401);
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    sendError(res, 'Unauthorised – invalid or expired token', 401);
  }
}

/**
 * requireRoles — restricts access to users with specified roles.
 * Must be used AFTER requireAuth.
 */
export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorised', 401);
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(
        res,
        `Forbidden – required role: ${roles.join(' or ')}`,
        403
      );
      return;
    }

    next();
  };
}

/**
 * Convenience: only super_admin can access.
 */
export const requireAdmin = [requireAuth, requireRoles('super_admin')];

/**
 * Convenience: super_admin or operations can access.
 */
export const requireOperations = [requireAuth, requireRoles('super_admin', 'operations')];
