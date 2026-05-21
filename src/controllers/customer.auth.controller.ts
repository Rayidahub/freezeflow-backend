// src/controllers/customer.auth.controller.ts
// Customer-facing authentication: register, login, profile

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { sendSuccess, sendError } from '../utils/response';
import { CustomerRegisterDto } from '../types';

const SALT_ROUNDS = 12;

function signCustomerToken(customerId: string, email: string): string {
  const secret = process.env.JWT_SECRET as string;
  return jwt.sign(
    { customerId, email, type: 'customer' },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
  );
}

// ─── POST /api/customers/register ────────────────────────────────────────────

export async function registerCustomer(req: Request, res: Response): Promise<void> {
  try {
    const { fullName, email, phone, password, deliveryAddress }: CustomerRegisterDto = req.body;

    const existing = await prisma.customer.findUnique({ where: { email } });
    if (existing) {
      sendError(res, 'An account with this email already exists', 409);
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const customer = await prisma.customer.create({
      data: {
        fullName,
        email,
        phone,
        passwordHash,
        deliveryAddress: deliveryAddress ?? null,
      },
      select: {
        id: true, fullName: true, email: true,
        phone: true, deliveryAddress: true, createdAt: true,
      },
    });

    const token = signCustomerToken(customer.id, customer.email);

    sendSuccess(res, { token, customer }, 'Account created successfully', 201);
  } catch (error) {
    console.error('[customer/register]', error);
    sendError(res, 'Failed to create account', 500);
  }
}

// ─── POST /api/customers/login ────────────────────────────────────────────────

export async function loginCustomer(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    const customer = await prisma.customer.findUnique({ where: { email } });
    if (!customer) {
      sendError(res, 'Invalid email or password', 401);
      return;
    }

    const valid = await bcrypt.compare(password, customer.passwordHash);
    if (!valid) {
      sendError(res, 'Invalid email or password', 401);
      return;
    }

    const token = signCustomerToken(customer.id, customer.email);

    sendSuccess(res, {
      token,
      customer: {
        id:              customer.id,
        fullName:        customer.fullName,
        email:           customer.email,
        phone:           customer.phone,
        deliveryAddress: customer.deliveryAddress,
      },
    }, 'Login successful');
  } catch (error) {
    console.error('[customer/login]', error);
    sendError(res, 'Login failed', 500);
  }
}

// ─── GET /api/customers/me ────────────────────────────────────────────────────

export async function getCustomerProfile(req: Request, res: Response): Promise<void> {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.customer!.customerId },
      select: {
        id: true, fullName: true, email: true,
        phone: true, deliveryAddress: true, createdAt: true,
      },
    });

    if (!customer) {
      sendError(res, 'Customer not found', 404);
      return;
    }

    sendSuccess(res, customer);
  } catch (error) {
    console.error('[customer/me]', error);
    sendError(res, 'Failed to fetch profile', 500);
  }
}

// ─── PUT /api/customers/me ────────────────────────────────────────────────────

export async function updateCustomerProfile(req: Request, res: Response): Promise<void> {
  try {
    const { fullName, phone, deliveryAddress } = req.body;

    const customer = await prisma.customer.update({
      where: { id: req.customer!.customerId },
      data: {
        ...(fullName        && { fullName }),
        ...(phone           && { phone }),
        ...(deliveryAddress !== undefined && { deliveryAddress }),
      },
      select: {
        id: true, fullName: true, email: true,
        phone: true, deliveryAddress: true,
      },
    });

    sendSuccess(res, customer, 'Profile updated');
  } catch (error) {
    console.error('[customer/update]', error);
    sendError(res, 'Failed to update profile', 500);
  }
}
