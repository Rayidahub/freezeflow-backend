// src/types/index.ts
// Central TypeScript types for FreezeFlow Ops backend

export type UserRole = 'super_admin' | 'operations' | 'delivery';

export type ExpenseType =
  | 'fuel' | 'electricity' | 'water' | 'nylon'
  | 'transportation' | 'labor' | 'maintenance' | 'miscellaneous';

export type DeliveryMethod  = 'delivery' | 'pickup';
export type OrderStatus     = 'pending' | 'confirmed' | 'processing' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type PaymentStatus   = 'unpaid' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod   = 'card' | 'bank_transfer' | 'ussd' | 'cash';

// ─── Staff JWT payload ────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  email:  string;
  role:   UserRole;
  iat?:   number;
  exp?:   number;
}

// ─── Customer JWT payload ─────────────────────────────────────────────────────

export interface CustomerJwtPayload {
  customerId: string;
  email:      string;
  type:       'customer';
  iat?:       number;
  exp?:       number;
}

// ─── Express Request augmentation ────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?:     JwtPayload;
      customer?: CustomerJwtPayload;
    }
  }
}

// ─── Auth DTOs ────────────────────────────────────────────────────────────────

export interface RegisterDto {
  fullName: string;
  email:    string;
  password: string;
  role?:    UserRole;
}

export interface LoginDto {
  email:    string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id:       string;
    fullName: string;
    email:    string;
    role:     UserRole;
  };
}

// ─── Customer Auth DTOs ───────────────────────────────────────────────────────

export interface CustomerRegisterDto {
  fullName:        string;
  email:           string;
  phone:           string;
  password:        string;
  deliveryAddress?: string;
}

export interface CustomerAuthResponse {
  token:    string;
  customer: {
    id:               string;
    fullName:         string;
    email:            string;
    phone:            string;
    deliveryAddress?: string | null;
  };
}

// ─── API Response wrapper ─────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success:  boolean;
  message?: string;
  data?:    T;
  errors?:  string[];
}
