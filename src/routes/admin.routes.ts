import { Router } from 'express';
import { requireAuth, requireRoles } from '../middleware/auth';
import { prisma } from '../utils/prisma';

const router = Router();

router.get('/customers', 
  requireAuth, 
  requireRoles('super_admin', 'operations'),
  async (req, res) => {
    try {
      const customers = await prisma.customer.findMany({
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: customers });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch customers' });
    }
  }
);

export default router;