// src/domain/session.ts

/**
 * Sesión de autenticación para CLI.
 * Se persiste como JSONL en data/sessions.txt (una línea por sesión).
 */
export interface Session {
  id: string;            // p.ej., ulid() o uuid v4
  userId: string;        // referencia al usuario
  issuedAt: string;      // ISO-8601
  expiresAt: string;     // ISO-8601
  lastUsedAt: string;   // ISO-8601
  revokedAt?: string | undefined;    // ISO-8601 (si se revoca antes de expirar)
  ipHash?: string | undefined;       // hash del origen (si lo calculas); útil para rate-limit/auditoría
  userAgent?: string | undefined;    // descripción simple del cliente/CLI
}

/**
 * Vista pública segura (para imprimir por consola).
 */
export interface PublicSession {
  id: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
  lastUsedAt: string;
  isActive: boolean;
}

/**
 * Crea una sesión nueva con TTL en minutos.
 */
export function createSession(params: {
  id: string;
  userId: string;
  ttlMinutes: number;      // default 60
  now?: Date | undefined;               // para testear
  ipHash?: string | undefined;
  userAgent? : string | undefined;
}): Session {
  const now = params.now ?? new Date();
  const issued = now.toISOString();
  const exp = new Date(now.getTime() + (params.ttlMinutes ?? 60) * 60_000).toISOString();

  return {
    id: params.id,
    userId: params.userId,
    issuedAt: issued,
    expiresAt: exp,
    lastUsedAt: issued,
    ipHash: params.ipHash,
    userAgent: params.userAgent,
  };
}

/**
 * Marca actividad en la sesión (útil tras cada comando autenticado).
 */
export function touchSession(s: Session, when = new Date()): void {
  s.lastUsedAt = when.toISOString();
}

/**
 * Revoca una sesión (logout / admin invalidate).
 */
export function revokeSession(s: Session, when = new Date()): void {
  s.revokedAt = when.toISOString();
}

/**
 * ¿La sesión está expirada a una fecha/hora dada?
 */
export function isExpired(s: Pick<Session, 'expiresAt'>, at = new Date()): boolean {
  return new Date(s.expiresAt).getTime() <= at.getTime();
}

/**
 * ¿La sesión está activa (no revocada y no expirada)?
 */
export function isActive(s: Session, at = new Date()): boolean {
  return !s.revokedAt && !isExpired(s, at);
}

/**
 * Serializa la sesión a una línea JSON (para sessions.txt).
 */
export function serializeSession(s: Session): string {
  return JSON.stringify(s);
}

/**
 * Parsea una línea JSON a Session, con validación básica.
 * Retorna null si la línea no es válida.
 */
export function parseSession(line: string): Session | null {
  try {
    const obj = JSON.parse(line) as any;
    if (!isValidSession(obj)) return null;
    return obj;
  } catch {
    return null;
  }
}

/**
 * Valida la forma básica de una sesión.
 */
export function isValidSession(obj: any): obj is Session {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.id !== 'string') return false;
  if (typeof obj.userId !== 'string') return false;
  if (!isIso(obj.issuedAt) || !isIso(obj.expiresAt)) return false;
  if (obj.lastUsedAt && !isIso(obj.lastUsedAt)) return false;
  if (obj.revokedAt && !isIso(obj.revokedAt)) return false;
  if (obj.ipHash && typeof obj.ipHash !== 'string') return false;
  if (obj.userAgent && typeof obj.userAgent !== 'string') return false;
  return true;
}

/**
 * Proyección segura para mostrar en CLI.
 */
export function toPublicSession(s: Session, at = new Date()): PublicSession {
  return {
    id: s.id,
    userId: s.userId,
    issuedAt: s.issuedAt,
    expiresAt: s.expiresAt,
    lastUsedAt: s.lastUsedAt,
    isActive: isActive(s, at),
  };
}

/* ========== Helpers internos ========== */

function isIso(v: any): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

/* ====== Ejemplo de uso ======
import { createSession, serializeSession, parseSession, isActive, revokeSession } from './session';

const s = createSession({ id: 'sess_123', userId: 'u_1', ttlMinutes: 30 });
const line = serializeSession(s);            // -> escribir en data/sessions.txt
const parsed = parseSession(line)!;          // <- leer desde archivo
console.log(isActive(parsed));               // true
revokeSession(parsed);
console.log(isActive(parsed));               // false
================================ */
