// src/controllers/product.controller.ts
// Product listing (public) + staff CRUD for managing products

import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { sendSuccess, sendError } from '../utils/response';

// ─── GET /api/products ────────────────────────────────────────────────────────
// Public — no auth required

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const showAll = req.query.showAll === 'true' && req.user?.role === 'super_admin';

    const products = await prisma.product.findMany({
      where:   showAll ? {} : { isAvailable: true },
      orderBy: { sizeKg: 'asc' },
    });

    sendSuccess(res, products);
  } catch (error) {
    console.error('[product/getAll]', error);
    sendError(res, 'Failed to fetch products', 500);
  }
}

// ─── GET /api/products/:id ────────────────────────────────────────────────────

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
    });

    if (!product) {
      sendError(res, 'Product not found', 404);
      return;
    }

    sendSuccess(res, product);
  } catch (error) {
    console.error('[product/getOne]', error);
    sendError(res, 'Failed to fetch product', 500);
  }
}

// ─── POST /api/products ───────────────────────────────────────────────────────
// Staff only — super_admin

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { name, sizeKg, price, isAvailable = true } = req.body;

    const product = await prisma.product.create({
      data: {
        name,
        sizeKg:      Number(sizeKg),
        price:       Number(price),
        isAvailable: Boolean(isAvailable),
      },
    });

    sendSuccess(res, product, 'Product created', 201);
  } catch (error) {
    console.error('[product/create]', error);
    sendError(res, 'Failed to create product', 500);
  }
}

// ─── PUT /api/products/:id ────────────────────────────────────────────────────

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      sendError(res, 'Product not found', 404);
      return;
    }

    const { name, sizeKg, price, isAvailable } = req.body;

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data:  {
        ...(name        !== undefined && { name }),
        ...(sizeKg      !== undefined && { sizeKg: Number(sizeKg) }),
        ...(price       !== undefined && { price: Number(price) }),
        ...(isAvailable !== undefined && { isAvailable: Boolean(isAvailable) }),
      },
    });

    sendSuccess(res, product, 'Product updated');
  } catch (error) {
    console.error('[product/update]', error);
    sendError(res, 'Failed to update product', 500);
  }
}

// ─── DELETE /api/products/:id ─────────────────────────────────────────────────

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      sendError(res, 'Product not found', 404);
      return;
    }

    // Soft-delete: mark unavailable instead of hard-deleting (orders reference products)
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data:  { isAvailable: false },
    });

    sendSuccess(res, product, 'Product marked unavailable');
  } catch (error) {
    console.error('[product/remove]', error);
    sendError(res, 'Failed to remove product', 500);
  }
}
