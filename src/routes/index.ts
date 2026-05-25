// src/routes/index.ts
import { Router, Request, Response } from 'express';
import authRoutes        from './auth.routes';
import productionRoutes  from './production.routes';
import expenseRoutes     from './expense.routes';
import customerRoutes    from './customer.routes';
import productRoutes     from './product.routes';
import orderRoutes       from './order.routes';
import paymentRoutes     from './payment.routes';
import analyticsRoutes   from './analytics.routes';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status:      'ok',
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version:     '7.0.0',
  });
});

router.use('/auth',       authRoutes);
router.use('/production', productionRoutes);
router.use('/expenses',   expenseRoutes);
router.use('/customers',  customerRoutes);
router.use('/products',   productRoutes);
router.use('/orders',     orderRoutes);
router.use('/payments',   paymentRoutes);
router.use('/analytics',  analyticsRoutes);

export default router;
