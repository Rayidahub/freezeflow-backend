// src/routes/index.ts
// Mounts all route modules under /api

import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes';

const router = Router();

// ─── Health Check ─────────────────────────────────────────────────────────────
/**
 * @route   GET /api/health
 * @desc    Liveness check
 * @access  Public
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ─── Feature routes ───────────────────────────────────────────────────────────
router.use('/auth', authRoutes);

// More routes will be added in future sprints:
// router.use('/production', productionRoutes);
// router.use('/expenses', expenseRoutes);
// router.use('/products', productRoutes);
// router.use('/orders', orderRoutes);
// router.use('/customers', customerRoutes);

export default router;
