// src/controllers/expense.controller.ts
// Full CRUD for operational expense logs + summary/breakdown endpoint

import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { sendSuccess, sendError } from '../utils/response';

// ─── Helper ───────────────────────────────────────────────────────────────────

function toUTCDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getPeriodStart(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case 'today':
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return today;
    case 'week':
      const week = new Date(now);
      week.setDate(now.getDate() - 7);
      week.setUTCHours(0, 0, 0, 0);
      return week;
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'all':
      return null;
    default:
      const def = new Date();
      def.setUTCHours(0, 0, 0, 0);
      return def;
  }
}

// ─── GET /api/expenses ────────────────────────────────────────────────────────

/**
 * List all expense logs with optional filtering and pagination.
 * Query params: page, limit, from (YYYY-MM-DD), to (YYYY-MM-DD), type (ExpenseType)
 */
export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const skip  = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (req.query.from || req.query.to) {
      where.date = {
        ...(req.query.from && { gte: toUTCDay(req.query.from as string) }),
        ...(req.query.to   && { lte: toUTCDay(req.query.to   as string) }),
      };
    }

    if (req.query.type) {
      where.expenseType = req.query.type;
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      prisma.expense.count({ where }),
    ]);

    sendSuccess(res, {
      expenses,
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
    console.error('[expense/getAll]', error);
    sendError(res, 'Failed to fetch expenses', 500);
  }
}

// ─── GET /api/expenses/summary ────────────────────────────────────────────────

/**
 * Aggregated expense stats for the dashboard + category breakdown.
 * Query params: period = today | week | month | all
 */
export async function getSummary(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || 'today';
    const from   = getPeriodStart(period);
    const where  = from ? { date: { gte: from } } : {};

    // Total amount
    const agg = await prisma.expense.aggregate({
      where,
      _sum:   { amount: true },
      _count: { id: true },
    });

    // Breakdown by expense type
    const byType = await prisma.expense.groupBy({
      by:      ['expenseType'],
      where,
      _sum:    { amount: true },
      _count:  { id: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    const breakdown = byType.map((row: { expenseType: string; _sum: { amount: number | null }; _count: { id: number } }) => ({
      expenseType: row.expenseType,
      total:       row._sum.amount ?? 0,
      count:       row._count.id,
    }));

    sendSuccess(res, {
      period,
      totalExpenses: agg._sum.amount ?? 0,
      totalEntries:  agg._count.id,
      breakdown,
    });
  } catch (error) {
    console.error('[expense/getSummary]', error);
    sendError(res, 'Failed to fetch expense summary', 500);
  }
}

// ─── GET /api/expenses/:id ────────────────────────────────────────────────────

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const expense = await prisma.expense.findUnique({
      where:   { id: req.params.id },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    if (!expense) {
      sendError(res, 'Expense not found', 404);
      return;
    }

    sendSuccess(res, expense);
  } catch (error) {
    console.error('[expense/getOne]', error);
    sendError(res, 'Failed to fetch expense', 500);
  }
}

// ─── POST /api/expenses ───────────────────────────────────────────────────────

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { date, expenseType, amount, description } = req.body;

    const expense = await prisma.expense.create({
      data: {
        date:        toUTCDay(date),
        expenseType,
        amount:      Number(amount),
        description: description ?? null,
        userId:      req.user!.userId,
      },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    sendSuccess(res, expense, 'Expense recorded successfully', 201);
  } catch (error) {
    console.error('[expense/create]', error);
    sendError(res, 'Failed to record expense', 500);
  }
}

// ─── PUT /api/expenses/:id ────────────────────────────────────────────────────

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });

    if (!existing) {
      sendError(res, 'Expense not found', 404);
      return;
    }

    // Only creator or super_admin can edit
    if (existing.userId !== req.user!.userId && req.user!.role !== 'super_admin') {
      sendError(res, 'You are not authorised to edit this expense', 403);
      return;
    }

    const { date, expenseType, amount, description } = req.body;

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data:  {
        date:        date        ? toUTCDay(date) : existing.date,
        expenseType: expenseType ?? existing.expenseType,
        amount:      amount      ? Number(amount) : existing.amount,
        description: description !== undefined ? description : existing.description,
      },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    sendSuccess(res, expense, 'Expense updated');
  } catch (error) {
    console.error('[expense/update]', error);
    sendError(res, 'Failed to update expense', 500);
  }
}

// ─── DELETE /api/expenses/:id ─────────────────────────────────────────────────

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });

    if (!existing) {
      sendError(res, 'Expense not found', 404);
      return;
    }

    // Only super_admin can delete
    if (req.user!.role !== 'super_admin') {
      sendError(res, 'Only super admins can delete expense records', 403);
      return;
    }

    await prisma.expense.delete({ where: { id: req.params.id } });
    sendSuccess(res, null, 'Expense deleted');
  } catch (error) {
    console.error('[expense/remove]', error);
    sendError(res, 'Failed to delete expense', 500);
  }
}
