// src/services/audit.service.ts
import { randomUUID, createHmac } from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

const LOGS_DIR = path.resolve(process.cwd(), 'logs');
const AUDIT_LOG_PATH = process.env.AUDIT_LOG_PATH
  ? path.resolve(process.cwd(), process.env.AUDIT_LOG_PATH)
  : path.join(LOGS_DIR, 'audit.log');

const APP_LOG_PATH = process.env.APP_LOG_PATH
  ? path.resolve(process.cwd(), process.env.APP_LOG_PATH)
  : path.join(LOGS_DIR, 'app.log');

const IP_HASH_SECRET = process.env.AUDIT_IP_SALT || process.env.JWT_SECRET || 'change-me-ip-salt';

/**
 * Nivel de detalle de auditoría.
 * - "minimal": omite metadata sensible
 * - "normal": registra metadata segura
 * - "verbose": registra metadata amplia (pero aplica redacción básica)
 */
type AuditVerbosity = 'minimal' | 'normal' | 'verbose';

export type AuditStatus = 'success' | 'fail';

export interface AuditActor {
  userId?: string;
  email?: string;
}

export interface AuditEvent {
  id: string;           // UUID
  ts: string;           // ISO-8601
  action: string;       // ej.: "auth.login", "user.register", "mfa.verify", "role.assign"
  resource?: string | undefined;    // ej.: "user", "session", "mfa", "role"
  targetId?: string | undefined;    // si aplica (id del usuario/rol/sesión afectado)
  sessionId?: string | undefined;   // sesión desde la que se ejecuta
  status: AuditStatus;  // success | fail
  reason?: string | undefined;      // mensaje corto para fallos o detalle complementario
  actor?: AuditActor | undefined;   // quién ejecuta
  ipHash?: string | undefined;      // hash de IP (no IP en claro)
  userAgent?: string | undefined;   // CLI/versión si quieres registrar
  meta?: Record<string, unknown> | undefined; // metadata (redactada según el nivel)
}

/* ===================== API pública ===================== */

/**
 * Registra un evento de auditoría en formato JSONL (una línea por evento).
 * Crea el directorio/archivo si no existen.
 */
export async function auditEvent(
  evt: Omit<AuditEvent, 'id' | 'ts' | 'ipHash'> & { ip?: string },
  verbosity: AuditVerbosity = 'normal'
): Promise<void> {
  await ensureLogs();

  const sanitized = sanitizeEvent(evt, verbosity);
  const toWrite: AuditEvent = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    action: sanitized.action,
    resource: sanitized.resource,
    targetId: sanitized.targetId,
    sessionId: sanitized.sessionId,
    status: sanitized.status,
    reason: sanitized.reason,
    actor: sanitized.actor,
    ipHash: sanitizeIpToHash(evt.ip),
    userAgent: sanitized.userAgent,
    meta: sanitized.meta,
  };

  const line = JSON.stringify(toWrite);
  await fsp.appendFile(AUDIT_LOG_PATH, line + '\n', 'utf8');
}

/**
 * Lectura rápida del archivo de auditoría con filtros simples.
 * Nota: Para archivos grandes, considera un lector por streaming/tail.
 */
export async function readAudit(options?: {
  limit?: number;                     // por defecto 100
  sinceIso?: string;                  // filtra por fecha mínima
  actionPrefix?: string;              // ej.: "auth." retorna auth.login/logout/etc.
  userId?: string;                    // actor.userId o targetId
  status?: AuditStatus;
}): Promise<AuditEvent[]> {
  await ensureLogs();
  let data = '';
  try {
    data = await fsp.readFile(AUDIT_LOG_PATH, 'utf8');
  } catch (e) {
    // si no existe o vacío
    return [];
  }

  const lines = data.split('\n').filter(Boolean);
  const limit = options?.limit ?? 100;

  const sinceTs = options?.sinceIso ? Date.parse(options.sinceIso) : undefined;

  const out: AuditEvent[] = [];
  // Recorremos desde el final para devolver "lo más reciente" primero
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const line = lines[i];
    const parsed = safeParse<AuditEvent>(line?.toString() || '');
    if (!parsed) continue;

    if (sinceTs !== undefined && Date.parse(parsed.ts) < sinceTs) continue;
    if (options?.actionPrefix && !parsed.action.startsWith(options.actionPrefix)) continue;

    if (options?.userId) {
      const matchActor = parsed.actor?.userId === options.userId;
      const matchTarget = parsed.targetId === options.userId;
      if (!matchActor && !matchTarget) continue;
    }

    if (options?.status && parsed.status !== options.status) continue;

    out.push(parsed);
  }

  return out;
}

/**
 * Helper para registrar también errores de aplicación (no solo auditoría).
 * Útil cuando un write/IO falla, etc.
 */
export async function appLogError(err: unknown, context?: Record<string, unknown>): Promise<void> {
  await ensureLogs();
  const rec = {
    ts: new Date().toISOString(),
    level: 'error',
    msg: errToString(err),
    context: redactMeta(context),
  };
  await fsp.appendFile(APP_LOG_PATH, JSON.stringify(rec) + '\n', 'utf8');
}

/* ===================== Internals ===================== */

function sanitizeEvent(
  evt: Omit<AuditEvent, 'id' | 'ts' | 'ipHash'> & { ip?: string },
  verbosity: AuditVerbosity
): Omit<AuditEvent, 'id' | 'ts' | 'ipHash'> {
  // Redacta metadata sensible según el nivel configurado
  const base: Omit<AuditEvent, 'id' | 'ts' | 'ipHash'> = {
    action: evt.action,
    resource: evt.resource,
    targetId: evt.targetId,
    sessionId: evt.sessionId,
    status: evt.status,
    reason: evt.reason,
    actor: evt.actor ? sanitizeActor(evt.actor) : undefined,
    userAgent: evt.userAgent,
    meta: undefined,
  };

  if (verbosity === 'minimal') {
    base.meta = undefined;
  } else if (verbosity === 'normal') {
    base.meta = redactMeta(evt.meta);
  } else {
    // 'verbose': permitimos más campos pero igual aplicamos redacción a claves sensibles
    base.meta = redactMeta(evt.meta);
  }

  return base;
}

function sanitizeActor(a: AuditActor): AuditActor {
  const actor: AuditActor = {};
  if (a.userId) actor.userId = a.userId;
  // el email puede ser útil para auditoría; mantenlo si ya está normalizado en tu dominio
  if (a.email) actor.email = a.email.toLowerCase();
  return actor;
}

function sanitizeIpToHash(ip?: string): string | undefined {
  if (!ip) return undefined;
  try {
    return createHmac('sha256', IP_HASH_SECRET).update(ip).digest('hex');
  } catch {
    return 'iphash_error';
  }
}

function redactMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  // Claves que nunca deberían quedar en claro
  const SENSITIVE_KEYS = new Set([
    'password', 'pass', 'pwd',
    'token', 'accessToken', 'refreshToken', 'jwt',
    'secret', 'mfaSecret', 'otp', 'otpCode',
    'recoveryCodes',
  ]);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 1024) {
      out[k] = v.slice(0, 1024) + '…';
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function ensureLogs(): Promise<void> {
  await fsp.mkdir(LOGS_DIR, { recursive: true });
  await touchFile(AUDIT_LOG_PATH);
  await touchFile(APP_LOG_PATH);
}

async function touchFile(filePath: string): Promise<void> {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(filePath, '', 'utf8');
  }
}

function safeParse<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}

function errToString(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/* ======= Ejemplos de uso =======

await auditEvent(
  {
    action: 'auth.login',
    resource: 'auth',
    status: 'success',
    actor: { userId: 'u_123', email: 'alice@example.com' },
    sessionId: 'sess_456',
    ip: '192.168.0.10',
    meta: { method: 'password+mfa' }
  },
  'normal'
);

const last = await readAudit({ actionPrefix: 'auth.', limit: 20 });

================================= */
