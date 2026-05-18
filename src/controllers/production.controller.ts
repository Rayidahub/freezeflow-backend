// src/controllers/production.controller.ts
// Full CRUD for daily production logs + summary stats endpoint

import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { sendSuccess, sendError } from '../utils/response';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string into a UTC start-of-day Date */
function toUTCDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── GET /api/production ──────────────────────────────────────────────────────

/**
 * List all production logs with optional date-range filtering and pagination.
 * Query params:
 *   page     (default 1)
 *   limit    (default 20)
 *   from     YYYY-MM-DD
 *   to       YYYY-MM-DD
 */
export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const skip  = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (req.query.from || req.query.to) {
      where.date = {
        ...(req.query.from && { gte: toUTCDay(req.query.from as string) }),
        ...(req.query.to   && { lte: toUTCDay(req.query.to   as string) }),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.production.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      prisma.production.count({ where }),
    ]);

    sendSuccess(res, {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('[production/getAll]', error);
    sendError(res, 'Failed to fetch production logs', 500);
  }
}

// ─── GET /api/production/summary ─────────────────────────────────────────────

/**
 * Aggregated stats for the dashboard.
 * Query params:
 *   period   today | week | month | all  (default: today)
 */
export async function getSummary(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || 'today';

    const now = new Date();
    let from: Date;

    switch (period) {
      case 'week':
        from = new Date(now);
        from.setDate(now.getDate() - 7);
        from.setUTCHours(0, 0, 0, 0);
        break;
      case 'month':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'all':
        from = new Date(0);
        break;
      default: // today
        from = new Date();
        from.setUTCHours(0, 0, 0, 0);
    }

    const where = period === 'all' ? {} : { date: { gte: from } };

    const agg = await prisma.production.aggregate({
      where,
      _sum: {
        bagsProduced:   true,
        bagsSold:       true,
        damagedBags:    true,
        remainingStock: true,
        totalSales:     true,
      },
      _count: { id: true },
    });

    // Fetch most recent log for remaining stock snapshot
    const latest = await prisma.production.findFirst({
      orderBy: { date: 'desc' },
      select: { remainingStock: true, date: true },
    });

    sendSuccess(res, {
      period,
      totalLogs:      agg._count.id,
      bagsProduced:   agg._sum.bagsProduced   ?? 0,
      bagsSold:       agg._sum.bagsSold       ?? 0,
      damagedBags:    agg._sum.damagedBags    ?? 0,
      totalSales:     agg._sum.totalSales     ?? 0,
      currentStock:   latest?.remainingStock  ?? 0,
      lastUpdated:    latest?.date            ?? null,
    });
  } catch (error) {
    console.error('[production/getSummary]', error);
    sendError(res, 'Failed to fetch production summary', 500);
  }
}

// ─── GET /api/production/:id ──────────────────────────────────────────────────

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const log = await prisma.production.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    if (!log) {
      sendError(res, 'Production log not found', 404);
      return;
    }

    sendSuccess(res, log);
  } catch (error) {
    console.error('[production/getOne]', error);
    sendError(res, 'Failed to fetch production log', 500);
  }
}

// ─── POST /api/production ─────────────────────────────────────────────────────

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const {
      date,
      bagsProduced,
      bagsSold,
      damagedBags = 0,
      remainingStock,
      sellingPrice,
    } = req.body;

    const totalSales = bagsSold * sellingPrice;

    // Validate logical consistency
    if (bagsSold + damagedBags > bagsProduced) {
      sendError(res, 'Bags sold + damaged cannot exceed bags produced', 422);
      return;
    }

    const expectedRemaining = bagsProduced - bagsSold - damagedBags;
    if (remainingStock !== expectedRemaining) {
      sendError(
        res,
        `Remaining stock should be ${expectedRemaining} (produced − sold − damaged)`,
        422
      );
      return;
    }

    const log = await prisma.production.create({
      data: {
        date:           toUTCDay(date),
        bagsProduced:   Number(bagsProduced),
        bagsSold:       Number(bagsSold),
        damagedBags:    Number(damagedBags),
        remainingStock: Number(remainingStock),
        sellingPrice:   Number(sellingPrice),
        totalSales,
        userId:         req.user!.userId,
      },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    sendSuccess(res, log, 'Production log created successfully', 201);
  } catch (error) {
    console.error('[production/create]', error);
    sendError(res, 'Failed to create production log', 500);
  }
}

// ─── PUT /api/production/:id ──────────────────────────────────────────────────

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const existing = await prisma.production.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      sendError(res, 'Production log not found', 404);
      return;
    }

    // Only the creator or super_admin may edit
    if (existing.userId !== req.user!.userId && req.user!.role !== 'super_admin') {
      sendError(res, 'You are not authorised to edit this log', 403);
      return;
    }

    const {
      date,
      bagsProduced,
      bagsSold,
      damagedBags = existing.damagedBags,
      remainingStock,
      sellingPrice,
    } = req.body;

    const resolvedProduced   = Number(bagsProduced  ?? existing.bagsProduced);
    const resolvedSold       = Number(bagsSold       ?? existing.bagsSold);
    const resolvedDamaged    = Number(damagedBags);
    const resolvedRemaining  = Number(remainingStock ?? existing.remainingStock);
    const resolvedPrice      = Number(sellingPrice   ?? existing.sellingPrice);
    const totalSales         = resolvedSold * resolvedPrice;

    if (resolvedSold + resolvedDamaged > resolvedProduced) {
      sendError(res, 'Bags sold + damaged cannot exceed bags produced', 422);
      return;
    }

    const log = await prisma.production.update({
      where: { id: req.params.id },
      data: {
        date:           date ? toUTCDay(date) : existing.date,
        bagsProduced:   resolvedProduced,
        bagsSold:       resolvedSold,
        damagedBags:    resolvedDamaged,
        remainingStock: resolvedRemaining,
        sellingPrice:   resolvedPrice,
        totalSales,
      },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    sendSuccess(res, log, 'Production log updated');
  } catch (error) {
    console.error('[production/update]', error);
    sendError(res, 'Failed to update production log', 500);
  }
}

// ─── DELETE /api/production/:id ───────────────────────────────────────────────

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const existing = await prisma.production.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      sendError(res, 'Production log not found', 404);
      return;
    }

    // Only super_admin can delete
    if (req.user!.role !== 'super_admin') {
      sendError(res, 'Only super admins can delete production logs', 403);
      return;
    }

    await prisma.production.delete({ where: { id: req.params.id } });
    sendSuccess(res, null, 'Production log deleted');
  } catch (error) {
    console.error('[production/remove]', error);
    sendError(res, 'Failed to delete production log', 500);
  }
}
