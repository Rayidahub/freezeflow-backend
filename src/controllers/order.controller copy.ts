// src/controllers/order.controller.ts
// Customer: place order, view own orders, cancel pending order.
// Staff: view all orders, update order status.

import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { sendSuccess, sendError } from '../utils/response';
import { OrderStatus } from '../types';
import {
  sendEmail,
  orderConfirmedEmail,
  orderStatusUpdateEmail,
  newOrderStaffEmail,
} from '../utils/email';

const ORDER_INCLUDE = {
  customer: { select: { id: true, fullName: true, email: true, phone: true } },
  product:  { select: { id: true, name: true, sizeKg: true, price: true } },
};

// ─── Customer: POST /api/orders ───────────────────────────────────────────────

export async function placeOrder(req: Request, res: Response): Promise<void> {
  try {
    const customerId = req.customer!.customerId;
    const {
      productId, quantity, deliveryMethod,
      deliveryAddress, specialInstructions,
    } = req.body;

    // Validate product exists and is available
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      sendError(res, 'Product not found', 404);
      return;
    }
    if (!product.isAvailable) {
      sendError(res, 'This product is currently unavailable', 400);
      return;
    }

    // Delivery method requires an address
    if (deliveryMethod === 'delivery' && !deliveryAddress) {
      sendError(res, 'Delivery address is required for delivery orders', 422);
      return;
    }

    const totalAmount = product.price * Number(quantity);

    const order = await prisma.order.create({
      data: {
        customerId,
        productId,
        quantity:           Number(quantity),
        totalAmount,
        deliveryMethod,
        deliveryAddress:     deliveryAddress ?? null,
        specialInstructions: specialInstructions ?? null,
        orderStatus:         'pending',
        paymentStatus:       'unpaid',
      },
      include: ORDER_INCLUDE,
    });

    // Record initial status in history
    await prisma.orderStatusHistory.create({
      data: { orderId: order.id, status: 'pending', note: 'Order placed by customer' },
    });

    // Send confirmation to customer
    if (order.customer) {
      const emailData = {
        id: order.id, productName: order.product?.name ?? 'Ice Block',
        quantity: order.quantity, totalAmount: order.totalAmount,
        deliveryMethod: order.deliveryMethod, deliveryAddress: order.deliveryAddress,
        customerName: order.customer.fullName, customerEmail: order.customer.email,
      };
      sendEmail({ to: order.customer.email, ...orderConfirmedEmail(emailData) }).catch(console.error);

      // Notify admin
      if (process.env.ADMIN_EMAIL) {
        sendEmail({ to: process.env.ADMIN_EMAIL, ...newOrderStaffEmail(emailData) }).catch(console.error);
      }
    }

    sendSuccess(res, order, 'Order placed successfully', 201);
  } catch (error) {
    console.error('[order/place]', error);
    sendError(res, 'Failed to place order', 500);
  }
}

// ─── Customer: GET /api/orders/my ────────────────────────────────────────────

export async function getMyOrders(req: Request, res: Response): Promise<void> {
  try {
    const customerId = req.customer!.customerId;
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 10);
    const skip  = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where:   { customerId },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
        include: ORDER_INCLUDE,
      }),
      prisma.order.count({ where: { customerId } }),
    ]);

    sendSuccess(res, {
      orders,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('[order/myOrders]', error);
    sendError(res, 'Failed to fetch orders', 500);
  }
}

// ─── Customer: GET /api/orders/my/:id ────────────────────────────────────────

export async function getMyOrderById(req: Request, res: Response): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where:   { id: req.params.id, customerId: req.customer!.customerId },
      include: ORDER_INCLUDE,
    });

    if (!order) {
      sendError(res, 'Order not found', 404);
      return;
    }

    sendSuccess(res, order);
  } catch (error) {
    console.error('[order/getMyOne]', error);
    sendError(res, 'Failed to fetch order', 500);
  }
}

// ─── Customer: PATCH /api/orders/my/:id/cancel ───────────────────────────────

export async function cancelMyOrder(req: Request, res: Response): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, customerId: req.customer!.customerId },
    });

    if (!order) {
      sendError(res, 'Order not found', 404);
      return;
    }

    if (!['pending', 'confirmed'].includes(order.orderStatus)) {
      sendError(res, `Cannot cancel an order with status: ${order.orderStatus}`, 400);
      return;
    }

    const updated = await prisma.order.update({
      where:   { id: req.params.id },
      data:    { orderStatus: 'cancelled' },
      include: ORDER_INCLUDE,
    });

    sendSuccess(res, updated, 'Order cancelled');
  } catch (error) {
    console.error('[order/cancel]', error);
    sendError(res, 'Failed to cancel order', 500);
  }
}

// ─── Staff: GET /api/orders ───────────────────────────────────────────────────

export async function getAllOrders(req: Request, res: Response): Promise<void> {
  try {
    const page   = Math.max(1, parseInt(req.query.page   as string) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit as string) || 20);
    const skip   = (page - 1) * limit;
    const status = req.query.status as OrderStatus | undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (status) where.orderStatus = status;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
        include: ORDER_INCLUDE,
      }),
      prisma.order.count({ where }),
    ]);

    sendSuccess(res, {
      orders,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('[order/getAll]', error);
    sendError(res, 'Failed to fetch orders', 500);
  }
}

// ─── Staff: GET /api/orders/summary ──────────────────────────────────────────

export async function getOrderSummary(req: Request, res: Response): Promise<void> {
  try {
    const counts = await prisma.order.groupBy({
      by:     ['orderStatus'],
      _count: { id: true },
    });

    const summary = counts.reduce((acc: Record<string, number>, row: { orderStatus: string; _count: { id: number } }) => {
      acc[row.orderStatus] = row._count.id;
      return acc;
    }, {});

    const totalRevenue = await prisma.order.aggregate({
      where: { paymentStatus: 'paid' },
      _sum:  { totalAmount: true },
    });

    sendSuccess(res, {
      byStatus:     summary,
      totalPending: summary['pending']         ?? 0,
      totalActive:  (summary['confirmed']      ?? 0) + (summary['processing'] ?? 0) + (summary['out_for_delivery'] ?? 0),
      totalRevenue: totalRevenue._sum.totalAmount ?? 0,
    });
  } catch (error) {
    console.error('[order/summary]', error);
    sendError(res, 'Failed to fetch order summary', 500);
  }
}

// ─── Staff: GET /api/orders/:id ───────────────────────────────────────────────

export async function getOrderById(req: Request, res: Response): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where:   { id: req.params.id },
      include: ORDER_INCLUDE,
    });

    if (!order) {
      sendError(res, 'Order not found', 404);
      return;
    }

    sendSuccess(res, order);
  } catch (error) {
    console.error('[order/getOne]', error);
    sendError(res, 'Failed to fetch order', 500);
  }
}

// ─── Staff: PATCH /api/orders/:id/status ─────────────────────────────────────

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:          ['confirmed', 'cancelled'],
  confirmed:        ['processing', 'cancelled'],
  processing:       ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered:        [],
  cancelled:        [],
};

export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
  try {
    const { status } = req.body;

    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) {
      sendError(res, 'Order not found', 404);
      return;
    }

    const allowed = VALID_TRANSITIONS[order.orderStatus as OrderStatus];
    if (!allowed.includes(status as OrderStatus)) {
      sendError(
        res,
        `Cannot transition from '${order.orderStatus}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}`,
        400
      );
      return;
    }

    const updated = await prisma.order.update({
      where:   { id: req.params.id },
      data:    { orderStatus: status },
      include: ORDER_INCLUDE,
    });

    // Record status change in history
    await prisma.orderStatusHistory.create({
      data: {
        orderId:     req.params.id,
        status:      status as OrderStatus,
        changedById: req.user?.userId ?? null,
      },
    });

    // Fetch delivery staff name if transitioning to out_for_delivery
    let deliveryStaffName: string | undefined;
    if (status === 'out_for_delivery') {
      const assignment = await prisma.deliveryAssignment.findUnique({
        where:   { orderId: req.params.id },
        include: { deliveryStaff: { select: { fullName: true } } },
      });
      deliveryStaffName = assignment?.deliveryStaff.fullName;
    }

    // Send status update email to customer
    if (updated.customer && ['confirmed','out_for_delivery','delivered','cancelled'].includes(status)) {
      const emailData = {
        id: updated.id, productName: updated.product?.name ?? 'Ice Block',
        quantity: updated.quantity, totalAmount: updated.totalAmount,
        deliveryMethod: updated.deliveryMethod, deliveryAddress: updated.deliveryAddress,
        customerName: updated.customer.fullName, customerEmail: updated.customer.email,
      };
      sendEmail({
        to: updated.customer.email,
        ...orderStatusUpdateEmail(emailData, status, deliveryStaffName),
      }).catch(console.error);
    }

    sendSuccess(res, updated, `Order status updated to ${status}`);
  } catch (error) {
    console.error('[order/updateStatus]', error);
    sendError(res, 'Failed to update order status', 500);
  }
}
