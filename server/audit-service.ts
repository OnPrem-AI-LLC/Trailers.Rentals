import type { Request } from "express";
import { storage } from "./storage";

/**
 * Centralized audit log helper.
 * Use this instead of calling storage.createAuditLog() directly.
 * Automatically captures ipAddress from the request if provided.
 */
export async function logAuditEvent(params: {
  req?: Request;
  userId?: string | null;
  actionType: string;
  entityType?: string;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  isAdminEntry?: boolean;
}): Promise<void> {
  try {
    await storage.createAuditLog({
      userId: params.userId ?? null,
      actionType: params.actionType,
      entityType: params.entityType,
      entityId: params.entityId,
      description: params.description,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      ipAddress: params.req?.ip ?? null,
      isAdminEntry: params.isAdminEntry ?? false,
    });
  } catch (err) {
    // Non-fatal: log errors should never crash the request
    console.error("[audit] Failed to write audit log:", err);
  }
}
