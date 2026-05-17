// src/utils/response.ts
// Standardised API response helpers

import { Response } from 'express';
import { ApiResponse } from '../types';

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200
): Response {
  const body: ApiResponse<T> = { success: true, message, data };
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 400,
  errors?: string[]
): Response {
  const body: ApiResponse = { success: false, message, ...(errors && { errors }) };
  return res.status(statusCode).json(body);
}
