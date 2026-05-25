// src/controllers/analytics.controller.ts
// Comprehensive analytics for the FreezeFlow Ops dashboard.
// All endpoints require staff authentication.

import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { sendSuccess, sendError } from '../utils/response';

// ─── Helper: date range from period ──────────────────────────────────────────

function getDateRange(period: string): { from: Date; to: Date; prevFrom: Date; prevTo: Date } {
  const now = new Date();
  let from: Date;
  let to:   Date = new Date();

  switch (period) {
    case '7d':
      from = new Date(now); from.setDate(now.getDate() - 7); break;
    case '30d':
      from = new Date(now); from.setDate(now.getDate() - 30); break;
    case '90d':
      from = new Date(now); from.setDate(now.getDate() - 90); break;
    case 'year':
      from = new Date(now.getFullYear(), 0, 1); break;
    default: // 30d
      from = new Date(now); from.setDate(now.getDate() - 30);
  }

  from.setUTCHours(0, 0, 0, 0);

  // Previous period of same length for comparison
  const periodMs = to.getTime() - from.getTime();
  const prevTo   = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - periodMs);

  return { from, to, prevFrom, prevTo };
}

// ─── GET /api/analytics/kpi ───────────────────────────────────────────────────
// Top-level KPI cards with period-over-period comparison

export async function getKpi(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || '30d';
    const { from, to, prevFrom, prevTo } = getDateRange(period);

    const [
      // Current period
      prodCurrent, expCurrent, ordersCurrent, customersCurrent,
      // Previous period
      prodPrev, expPrev, ordersPrev, customersPrev,
      // Totals (all time)
      totalCustomers, currentStock,
    ] = await Promise.all([
      prisma.production.aggregate({
        where: { date: { gte: from, lte: to } },
        _sum:  { totalSales: true, bagsProduced: true, bagsSold: true, damagedBags: true },
        _count: { id: true },
      }),
      prisma.expense.aggregate({
        where: { date: { gte: from, lte: to } },
        _sum:  { amount: true },
      }),
      prisma.order.aggregate({
        where:  { createdAt: { gte: from, lte: to } },
        _count: { id: true },
        _sum:   { totalAmount: true },
      }),
      prisma.customer.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      // Previous period
      prisma.production.aggregate({
        where: { date: { gte: prevFrom, lte: prevTo } },
        _sum:  { totalSales: true, bagsProduced: true },
      }),
      prisma.expense.aggregate({
        where: { date: { gte: prevFrom, lte: prevTo } },
        _sum:  { amount: true },
      }),
      prisma.order.aggregate({
        where:  { createdAt: { gte: prevFrom, lte: prevTo } },
        _count: { id: true },
      }),
      prisma.customer.count({
        where: { createdAt: { gte: prevFrom, lte: prevTo } },
      }),
      prisma.customer.count(),
      prisma.production.findFirst({
        orderBy: { date: 'desc' },
        select:  { remainingStock: true },
      }),
    ]);

    const revenue       = prodCurrent._sum.totalSales   ?? 0;
    const expenses      = expCurrent._sum.amount        ?? 0;
    const netProfit     = revenue - expenses;
    const prevRevenue   = prodPrev._sum.totalSales      ?? 0;
    const prevExpenses  = expPrev._sum.amount           ?? 0;
    const prevNetProfit = prevRevenue - prevExpenses;

    function pctChange(current: number, prev: number): number | null {
      if (prev === 0) return null;
      return Math.round(((current - prev) / prev) * 100);
    }

    sendSuccess(res, {
      period,
      kpis: {
        revenue:       { value: revenue,      prev: prevRevenue,         change: pctChange(revenue, prevRevenue) },
        expenses:      { value: expenses,     prev: prevExpenses,        change: pctChange(expenses, prevExpenses) },
        netProfit:     { value: netProfit,    prev: prevNetProfit,       change: pctChange(netProfit, prevNetProfit) },
        bagsProduced:  { value: prodCurrent._sum.bagsProduced  ?? 0, prev: prodPrev._sum.bagsProduced ?? 0, change: pctChange(prodCurrent._sum.bagsProduced ?? 0, prodPrev._sum.bagsProduced ?? 0) },
        bagsSold:      { value: prodCurrent._sum.bagsSold      ?? 0, prev: 0,  change: null },
        damagedBags:   { value: prodCurrent._sum.damagedBags   ?? 0, prev: 0,  change: null },
        ordersPlaced:  { value: ordersCurrent._count.id,              prev: ordersPrev._count.id,  change: pctChange(ordersCurrent._count.id, ordersPrev._count.id) },
        orderRevenue:  { value: ordersCurrent._sum.totalAmount ?? 0,  prev: 0,  change: null },
        newCustomers:  { value: customersCurrent,                      prev: customersPrev,         change: pctChange(customersCurrent, customersPrev) },
        totalCustomers:{ value: totalCustomers, prev: 0, change: null },
        currentStock:  { value: currentStock?.remainingStock ?? 0,    prev: 0,  change: null },
        productionDays:{ value: prodCurrent._count.id,                prev: 0,  change: null },
      },
    });
  } catch (error) {
    console.error('[analytics/kpi]', error);
    sendError(res, 'Failed to fetch KPIs', 500);
  }
}

// ─── GET /api/analytics/revenue-trend ────────────────────────────────────────
// Daily revenue + expenses over time for line/bar chart

export async function getRevenueTrend(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || '30d';
    const { from, to } = getDateRange(period);

    const [production, expenses] = await Promise.all([
      prisma.production.findMany({
        where:   { date: { gte: from, lte: to } },
        select:  { date: true, totalSales: true, bagsProduced: true, bagsSold: true },
        orderBy: { date: 'asc' },
      }),
      prisma.expense.findMany({
        where:   { date: { gte: from, lte: to } },
        select:  { date: true, amount: true, expenseType: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    // Group by date string YYYY-MM-DD
    const revenueByDate: Record<string, number> = {};
    const expenseByDate: Record<string, number> = {};
    const bagsProducedByDate: Record<string, number> = {};
    const bagsSoldByDate: Record<string, number> = {};

    for (const p of production) {
      const key = p.date.toISOString().slice(0, 10);
      revenueByDate[key]      = (revenueByDate[key]      ?? 0) + p.totalSales;
      bagsProducedByDate[key] = (bagsProducedByDate[key] ?? 0) + p.bagsProduced;
      bagsSoldByDate[key]     = (bagsSoldByDate[key]     ?? 0) + p.bagsSold;
    }

    for (const e of expenses) {
      const key = e.date.toISOString().slice(0, 10);
      expenseByDate[key] = (expenseByDate[key] ?? 0) + e.amount;
    }

    // Build unified date array
    const allDates = Array.from(
      new Set([...Object.keys(revenueByDate), ...Object.keys(expenseByDate)])
    ).sort();

    const trend = allDates.map((date) => ({
      date,
      revenue:      revenueByDate[date]      ?? 0,
      expenses:     expenseByDate[date]      ?? 0,
      netProfit:    (revenueByDate[date] ?? 0) - (expenseByDate[date] ?? 0),
      bagsProduced: bagsProducedByDate[date] ?? 0,
      bagsSold:     bagsSoldByDate[date]     ?? 0,
    }));

    sendSuccess(res, { period, trend });
  } catch (error) {
    console.error('[analytics/revenueTrend]', error);
    sendError(res, 'Failed to fetch revenue trend', 500);
  }
}

// ─── GET /api/analytics/expense-breakdown ────────────────────────────────────
// Expense totals by category for pie/donut chart

export async function getExpenseBreakdown(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || '30d';
    const { from, to } = getDateRange(period);

    const breakdown = await prisma.expense.groupBy({
      by:    ['expenseType'],
      where: { date: { gte: from, lte: to } },
      _sum:  { amount: true },
      _count:{ id: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    const total = breakdown.reduce((sum: number, row: { _sum: { amount: number | null } }) => sum + (row._sum.amount ?? 0), 0);

    const data = breakdown.map((row: { expenseType: string; _sum: { amount: number | null }; _count: { id: number } }) => ({
      expenseType:  row.expenseType,
      amount:       row._sum.amount ?? 0,
      count:        row._count.id,
      percentage:   total > 0 ? Math.round(((row._sum.amount ?? 0) / total) * 100) : 0,
    }));

    sendSuccess(res, { period, total, breakdown: data });
  } catch (error) {
    console.error('[analytics/expenseBreakdown]', error);
    sendError(res, 'Failed to fetch expense breakdown', 500);
  }
}

// ─── GET /api/analytics/order-funnel ─────────────────────────────────────────
// Order counts by status + conversion metrics

export async function getOrderFunnel(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || '30d';
    const { from, to } = getDateRange(period);

    const [byStatus, byPayment, byDelivery] = await Promise.all([
      prisma.order.groupBy({
        by:    ['orderStatus'],
        where: { createdAt: { gte: from, lte: to } },
        _count:{ id: true },
        _sum:  { totalAmount: true },
      }),
      prisma.order.groupBy({
        by:    ['paymentStatus'],
        where: { createdAt: { gte: from, lte: to } },
        _count:{ id: true },
        _sum:  { totalAmount: true },
      }),
      prisma.order.groupBy({
        by:    ['deliveryMethod'],
        where: { createdAt: { gte: from, lte: to } },
        _count:{ id: true },
      }),
    ]);

    const total = byStatus.reduce((sum: number, r: { _count: { id: number } }) => sum + r._count.id, 0);

    sendSuccess(res, {
      period,
      total,
      byStatus: byStatus.map((r: { orderStatus: string; _count: { id: number }; _sum: { totalAmount: number | null } }) => ({
        status:  r.orderStatus,
        count:   r._count.id,
        revenue: r._sum.totalAmount ?? 0,
        pct:     total > 0 ? Math.round((r._count.id / total) * 100) : 0,
      })),
      byPayment: byPayment.map((r: { paymentStatus: string; _count: { id: number }; _sum: { totalAmount: number | null } }) => ({
        status:  r.paymentStatus,
        count:   r._count.id,
        revenue: r._sum.totalAmount ?? 0,
      })),
      byDelivery: byDelivery.map((r: { deliveryMethod: string; _count: { id: number } }) => ({
        method: r.deliveryMethod,
        count:  r._count.id,
        pct:    total > 0 ? Math.round((r._count.id / total) * 100) : 0,
      })),
    });
  } catch (error) {
    console.error('[analytics/orderFunnel]', error);
    sendError(res, 'Failed to fetch order funnel', 500);
  }
}

// ─── GET /api/analytics/production-efficiency ────────────────────────────────
// Production efficiency metrics: yield rate, damage rate, sell-through

export async function getProductionEfficiency(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || '30d';
    const { from, to } = getDateRange(period);

    const agg = await prisma.production.aggregate({
      where: { date: { gte: from, lte: to } },
      _sum: {
        bagsProduced:   true,
        bagsSold:       true,
        damagedBags:    true,
        remainingStock: true,
        totalSales:     true,
      },
      _count: { id: true },
      _avg:   { sellingPrice: true },
    });

    const produced  = agg._sum.bagsProduced   ?? 0;
    const sold      = agg._sum.bagsSold       ?? 0;
    const damaged   = agg._sum.damagedBags    ?? 0;
    const remaining = agg._sum.remainingStock ?? 0;

    const sellThroughRate = produced > 0 ? Math.round((sold / produced) * 100)    : 0;
    const damageRate      = produced > 0 ? Math.round((damaged / produced) * 100) : 0;
    const avgDailyProd    = agg._count.id > 0 ? Math.round(produced / agg._count.id) : 0;
    const avgDailySales   = agg._count.id > 0 ? Math.round((agg._sum.totalSales ?? 0) / agg._count.id) : 0;

    sendSuccess(res, {
      period,
      produced, sold, damaged, remaining,
      sellThroughRate,
      damageRate,
      avgDailyProduction: avgDailyProd,
      avgDailySales,
      avgSellingPrice:    Math.round(agg._avg.sellingPrice ?? 0),
      productionDays:     agg._count.id,
    });
  } catch (error) {
    console.error('[analytics/efficiency]', error);
    sendError(res, 'Failed to fetch production efficiency', 500);
  }
}

// ─── GET /api/analytics/top-customers ────────────────────────────────────────
// Top customers by order count and spend

export async function getTopCustomers(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || '30d';
    const limit  = Math.min(10, parseInt(req.query.limit as string) || 5);
    const { from, to } = getDateRange(period);

    const topCustomers = await prisma.order.groupBy({
      by:    ['customerId'],
      where: { createdAt: { gte: from, lte: to } },
      _count:{ id: true },
      _sum:  { totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: limit,
    });

    // Fetch customer names
    const customerIds = topCustomers.map((c: (typeof topCustomers)[number]) => c.customerId);
    const customers   = await prisma.customer.findMany({
      where:  { id: { in: customerIds } },
      select: { id: true, fullName: true, email: true, phone: true },
    });

    const customerMap = new Map(customers.map((c: { id: string; fullName: string; email: string; phone: string }) => [c.id, c]));

    const data = topCustomers.map((row: { customerId: string; _count: { id: number }; _sum: { totalAmount: number | null } }) => ({
      customer:    customerMap.get(row.customerId),
      orderCount:  row._count.id,
      totalSpend:  row._sum.totalAmount ?? 0,
    }));

    sendSuccess(res, { period, customers: data });
  } catch (error) {
    console.error('[analytics/topCustomers]', error);
    sendError(res, 'Failed to fetch top customers', 500);
  }
}

// ─── GET /api/analytics/report ────────────────────────────────────────────────
// Full combined report — all sections in one request for PDF/export

export async function getFullReport(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || '30d';

    // Fire all analytics queries in parallel
    const [kpiRes, trendRes, expenseRes, funnelRes, efficiencyRes, customersRes] =
      await Promise.allSettled([
        getKpiData(period),
        getTrendData(period),
        getExpenseData(period),
        getFunnelData(period),
        getEfficiencyData(period),
        getTopCustomersData(period),
      ]);

    sendSuccess(res, {
      period,
      generatedAt: new Date().toISOString(),
      kpi:         kpiRes.status        === 'fulfilled' ? kpiRes.value        : null,
      trend:       trendRes.status      === 'fulfilled' ? trendRes.value      : null,
      expenses:    expenseRes.status    === 'fulfilled' ? expenseRes.value    : null,
      funnel:      funnelRes.status     === 'fulfilled' ? funnelRes.value     : null,
      efficiency:  efficiencyRes.status === 'fulfilled' ? efficiencyRes.value : null,
      customers:   customersRes.status  === 'fulfilled' ? customersRes.value  : null,
    });
  } catch (error) {
    console.error('[analytics/report]', error);
    sendError(res, 'Failed to generate report', 500);
  }
}

// ─── Internal data helpers (reused by getFullReport) ─────────────────────────

async function getKpiData(period: string) {
  const { from, to, prevFrom, prevTo } = getDateRange(period);
  const [prod, exp, orders] = await Promise.all([
    prisma.production.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { totalSales: true, bagsProduced: true, bagsSold: true, damagedBags: true } }),
    prisma.expense.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { amount: true } }),
    prisma.order.aggregate({ where: { createdAt: { gte: from, lte: to } }, _count: { id: true }, _sum: { totalAmount: true } }),
  ]);
  const [prevProd, prevExp] = await Promise.all([
    prisma.production.aggregate({ where: { date: { gte: prevFrom, lte: prevTo } }, _sum: { totalSales: true } }),
    prisma.expense.aggregate({ where: { date: { gte: prevFrom, lte: prevTo } }, _sum: { amount: true } }),
  ]);
  const revenue  = prod._sum.totalSales ?? 0;
  const expenses = exp._sum.amount ?? 0;
  return { revenue, expenses, netProfit: revenue - expenses, prevRevenue: prevProd._sum.totalSales ?? 0, prevExpenses: prevExp._sum.amount ?? 0, orders: orders._count.id, orderRevenue: orders._sum.totalAmount ?? 0, bagsProduced: prod._sum.bagsProduced ?? 0, bagsSold: prod._sum.bagsSold ?? 0, damagedBags: prod._sum.damagedBags ?? 0 };
}

async function getTrendData(period: string) {
  const { from, to } = getDateRange(period);
  const [production, expenses] = await Promise.all([
    prisma.production.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true, totalSales: true }, orderBy: { date: 'asc' } }),
    prisma.expense.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true, amount: true }, orderBy: { date: 'asc' } }),
  ]);
  const rev: Record<string, number> = {};
  const exp: Record<string, number> = {};
  production.forEach((p: { date: Date; totalSales: number }) => { const k = p.date.toISOString().slice(0, 10); rev[k] = (rev[k] ?? 0) + p.totalSales; });
  expenses.forEach((e: { date: Date; amount: number }) => { const k = e.date.toISOString().slice(0, 10); exp[k] = (exp[k] ?? 0) + e.amount; });
  const dates = Array.from(new Set([...Object.keys(rev), ...Object.keys(exp)])).sort();
  return dates.map((date) => ({ date, revenue: rev[date] ?? 0, expenses: exp[date] ?? 0, netProfit: (rev[date] ?? 0) - (exp[date] ?? 0) }));
}

async function getExpenseData(period: string) {
  const { from, to } = getDateRange(period);
  return prisma.expense.groupBy({ by: ['expenseType'], where: { date: { gte: from, lte: to } }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } } });
}

async function getFunnelData(period: string) {
  const { from, to } = getDateRange(period);
  return prisma.order.groupBy({ by: ['orderStatus'], where: { createdAt: { gte: from, lte: to } }, _count: { id: true }, _sum: { totalAmount: true } });
}

async function getEfficiencyData(period: string) {
  const { from, to } = getDateRange(period);
  return prisma.production.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { bagsProduced: true, bagsSold: true, damagedBags: true, totalSales: true }, _count: { id: true } });
}

async function getTopCustomersData(period: string) {
  const { from, to } = getDateRange(period);
  return prisma.order.groupBy({ by: ['customerId'], where: { createdAt: { gte: from, lte: to } }, _count: { id: true }, _sum: { totalAmount: true }, orderBy: { _sum: { totalAmount: 'desc' } }, take: 5 });
}
