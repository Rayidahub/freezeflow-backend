// src/controllers/auth.controller.ts
// Handles staff authentication: register and login

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { signToken } from '../utils/jwt';
import { sendSuccess, sendError } from '../utils/response';
import { RegisterDto, LoginDto } from '../types';

const SALT_ROUNDS = 12;

/**
 * POST /api/auth/register
 * Registers a new staff member.
 * Restricted to super_admin in production; open for first-run setup.
 */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { fullName, email, password, role }: RegisterDto = req.body;

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      sendError(res, 'A user with this email already exists', 409);
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        role: role ?? 'operations',
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    sendSuccess(
      res,
      { token, user },
      'Staff member registered successfully',
      201
    );
  } catch (error) {
    console.error('[auth/register]', error);
    sendError(res, 'Failed to register user', 500);
  }
}

/**
 * POST /api/auth/login
 * Authenticates a staff member and returns a JWT.
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password }: LoginDto = req.body;

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Deliberately vague to prevent user enumeration
      sendError(res, 'Invalid email or password', 401);
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      sendError(res, 'Invalid email or password', 401);
      return;
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    sendSuccess(
      res,
      {
        token,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
      },
      'Login successful'
    );
  } catch (error) {
    console.error('[auth/login]', error);
    sendError(res, 'Login failed', 500);
  }
}

/**
 * GET /api/auth/me
 * Returns the currently authenticated staff member's profile.
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    sendSuccess(res, user, 'Profile fetched');
  } catch (error) {
    console.error('[auth/me]', error);
    sendError(res, 'Failed to fetch profile', 500);
  }
}
