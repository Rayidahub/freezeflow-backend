// src/routes/index.ts
// Mounts all route modules under /api

import { Router, Request, Response } from 'express';
import authRoutes       from './auth.routes';
import productionRoutes from './production.routes';

const router = Router();

// ─── Health Check ─────────────────────────────────────────────────────────────
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '2.0.0',
  });
});

// ─── Feature Routes ───────────────────────────────────────────────────────────
router.use('/auth',       authRoutes);
router.use('/production', productionRoutes);

// Stubs for future sprints:
// router.use('/expenses',  expenseRoutes);
// router.use('/products',  productRoutes);
// router.use('/orders',    orderRoutes);
// router.use('/customers', customerRoutes);

export default router;
