// src/controllers/delivery.controller.ts
// Delivery assignment management:
// - Assign delivery staff to an order
// - Get delivery staff list
// - Delivery staff: view their assigned orders
// - Mark delivery complete

import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { sendSuccess, sendError } from '../utils/response';
import { sendEmail, deliveryAssignmentEmail } from '../utils/email';

const ORDER_WITH_DELIVERY = {
  customer:           { select: { id: true, fullName: true, email: true, phone: true } },
  product:            { select: { id: true, name: true, sizeKg: true, price: true } },
  deliveryAssignment: {
    include: {
      deliveryStaff: { select: { id: true, fullName: true, email: true } },
    },
  },
};

// ─── GET /api/delivery/staff ──────────────────────────────────────────────────
// Returns list of delivery staff — for the assignment dropdown

export async function getDeliveryStaff(req: Request, res: Response): Promise<void> {
  try {
    const staff = await prisma.user.findMany({
      where:  { role: 'delivery' },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: 'asc' },
    });

    sendSuccess(res, staff);
  } catch (error) {
    console.error('[delivery/getStaff]', error);
    sendError(res, 'Failed to fetch delivery staff', 500);
  }
}

// ─── POST /api/delivery/assign ────────────────────────────────────────────────
// Assign a delivery staff member to an order

export async function assignDelivery(req: Request, res: Response): Promise<void> {
  try {
    const { orderId, deliveryStaffId, notes } = req.body;

    // Validate order exists and is in a deliverable state
    const order = await prisma.order.findUnique({
      where:   { id: orderId },
      include: {
        customer: { select: { fullName: true, email: true } },
        product:  { select: { name: true } },
      },
    });

    if (!order) {
      sendError(res, 'Order not found', 404);
      return;
    }

    if (!['confirmed', 'processing'].includes(order.orderStatus)) {
      sendError(res, `Cannot assign delivery to an order with status: ${order.orderStatus}`, 400);
      return;
    }

    if (order.deliveryMethod !== 'delivery') {
      sendError(res, 'This order is set for pickup, not delivery', 400);
      return;
    }

    // Validate delivery staff exists and has the delivery role
    const staff = await prisma.user.findUnique({
      where: { id: deliveryStaffId },
    });

    if (!staff) {
      sendError(res, 'Delivery staff member not found', 404);
      return;
    }

    if (staff.role !== 'delivery') {
      sendError(res, 'Selected user is not a delivery staff member', 400);
      return;
    }

    // Upsert assignment (allow re-assigning)
    const assignment = await prisma.deliveryAssignment.upsert({
      where:  { orderId },
      update: { deliveryStaffId, notes: notes ?? null },
      create: { orderId, deliveryStaffId, notes: notes ?? null },
      include: {
        deliveryStaff: { select: { id: true, fullName: true, email: true } },
        order: {
          include: {
            customer: { select: { fullName: true, email: true } },
            product:  { select: { name: true } },
          },
        },
      },
    });

    // Update order status to processing if still confirmed
    if (order.orderStatus === 'confirmed') {
      await prisma.order.update({
        where: { id: orderId },
        data:  { orderStatus: 'processing' },
      });

      await prisma.orderStatusHistory.create({
        data: {
          orderId,
          status:      'processing',
          changedById: req.user!.userId,
          note:        `Delivery assigned to ${staff.fullName}`,
        },
      });
    }

    // Send email to delivery staff
    const orderEmailData = {
      id:             order.id,
      productName:    order.product.name,
      quantity:       order.quantity,
      totalAmount:    order.totalAmount,
      deliveryMethod: order.deliveryMethod,
      deliveryAddress: order.deliveryAddress,
      customerName:   order.customer.fullName,
      customerEmail:  order.customer.email,
    };

    const emailContent = deliveryAssignmentEmail(staff.fullName, staff.email, orderEmailData);
    sendEmail({ to: staff.email, ...emailContent }).catch(console.error);

    sendSuccess(res, assignment, 'Delivery assigned successfully', 201);
  } catch (error) {
    console.error('[delivery/assign]', error);
    sendError(res, 'Failed to assign delivery', 500);
  }
}

// ─── GET /api/delivery/my-deliveries ─────────────────────────────────────────
// Delivery staff: see only their assigned orders

export async function getMyDeliveries(req: Request, res: Response): Promise<void> {
  try {
    const staffId    = req.user!.userId;
    const statusFilter = req.query.status as string | undefined;

    const assignments = await prisma.deliveryAssignment.findMany({
      where: {
        deliveryStaffId: staffId,
        ...(statusFilter
          ? { order: { orderStatus: statusFilter as never } }
          : { order: { orderStatus: { in: ['processing', 'out_for_delivery'] } } }
        ),
      },
      include: {
        order: {
          include: ORDER_WITH_DELIVERY,
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    const orders = assignments.map((a: typeof assignments[number]) => ({
      ...a.order,
      assignedAt:   a.assignedAt,
      deliveryNotes: a.notes,
    }));

    sendSuccess(res, orders);
  } catch (error) {
    console.error('[delivery/myDeliveries]', error);
    sendError(res, 'Failed to fetch deliveries', 500);
  }
}

// ─── GET /api/delivery/order/:orderId ────────────────────────────────────────
// Get delivery assignment for a specific order

export async function getDeliveryByOrder(req: Request, res: Response): Promise<void> {
  try {
    const assignment = await prisma.deliveryAssignment.findUnique({
      where:   { orderId: req.params.orderId },
      include: {
        deliveryStaff: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!assignment) {
      sendError(res, 'No delivery assignment found for this order', 404);
      return;
    }

    sendSuccess(res, assignment);
  } catch (error) {
    console.error('[delivery/getByOrder]', error);
    sendError(res, 'Failed to fetch delivery assignment', 500);
  }
}

// ─── GET /api/delivery/history/:orderId ──────────────────────────────────────
// Full status timeline for an order

export async function getOrderHistory(req: Request, res: Response): Promise<void> {
  try {
    const history = await prisma.orderStatusHistory.findMany({
      where:   { orderId: req.params.orderId },
      orderBy: { createdAt: 'asc' },
    });

    sendSuccess(res, history);
  } catch (error) {
    console.error('[delivery/getHistory]', error);
    sendError(res, 'Failed to fetch order history', 500);
  }
}
