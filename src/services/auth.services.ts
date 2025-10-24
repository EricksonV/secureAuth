// src/services/auth.service.ts
import { randomUUID } from 'crypto';
import { authenticator } from 'otplib';
//import { addMinutes } from '../utils/time.util'; // si no lo tienes aún, puedes calcular con Date directamente
import { createUser, isValidEmail, normalizeEmail, toPublicUser, touchUpdated, type User } from '../domain/user';
import { createSession, isActive, revokeSession, toPublicSession, type Session } from '../domain/session';
import { hashPassword, needsRehash, verifyPassword, validatePasswordStrength } from './password.services';

// Repositorios basados en archivos (.txt / JSONL). Debes implementarlos en storage/
// La interfaz esperada es mínima y directa para este servicio.
import {
  getUserByEmail,
  getUserById,
  addUser,
  updateUser,
} from '../storage/user.repository';

import {
  appendSession,
  getSessionById,
  updateSession,
} from '../storage/session.repository';

const DEFAULT_TTL_MIN = Number(process.env.SESSION_EXPIRATION_MINUTES ?? 60);

/** Errores específicos para un manejo claro en CLI */
export class AuthError extends Error {
  code:
    | 'INVALID_EMAIL'
    | 'WEAK_PASSWORD'
    | 'EMAIL_TAKEN'
    | 'USER_NOT_FOUND'
    | 'INVALID_CREDENTIALS'
    | 'ACCOUNT_LOCKED'
    | 'MFA_REQUIRED'
    | 'MFA_NOT_ENABLED'
    | 'MFA_INVALID'
    | 'SESSION_NOT_FOUND'
    | 'SESSION_INACTIVE';
  constructor(code: AuthError['code'], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

/** Política simple de lockout */
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

/* ===================== Registro ===================== */

/**
 * Registra un usuario:
 * - valida email y fortaleza
 * - verifica duplicado
 * - hashea password
 * - guarda en users.txt (vía repositorio)
 */
export async function registerUser(params: {
  email: string;
  password: string;
  roles?: string[]; // ['user'] por defecto
  extraPermissions?: string[];
}): Promise<ReturnType<typeof toPublicUser>> {
  const email = normalizeEmail(params.email);
  if (!isValidEmail(email)) throw new AuthError('INVALID_EMAIL', 'Email inválido');

  const strength = validatePasswordStrength(params.password);
  if (!strength.ok) throw new AuthError('WEAK_PASSWORD', strength.errors.join('; '));

  const existing = await getUserByEmail(email);
  if (existing) throw new AuthError('EMAIL_TAKEN', 'El email ya está registrado');

  const passHash = await hashPassword(params.password);

  const user = createUser({
    id: randomUUID(),
    email,
    passHash,
    roles: params.roles ?? ['user'],
    extraPermissions: params.extraPermissions ?? [],
  });

  await addUser(user);
  return toPublicUser(user);
}

/* ===================== Login / Logout ===================== */

/**
 * Realiza login:
 * - verifica lockout
 * - valida credenciales
 * - verifica MFA si está habilitado
 * - crea sesión con TTL y la persiste en sessions.txt
 */
export async function loginUser(params: {
  email: string;
  password: string;
  otpCode?: string; // requerido si MFA habilitado
  ttlMinutes?: number;
  ipHash?: string | undefined;
  userAgent?: string | undefined;
}): Promise<{ session: ReturnType<typeof toPublicSession>; user: ReturnType<typeof toPublicUser> }> {
  const email = normalizeEmail(params.email);
  const user = await getUserByEmail(email);
  if (!user) throw new AuthError('USER_NOT_FOUND', 'Usuario no encontrado');

  // Lockout check
  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > 0 && user.lockedUntil > now.getTime()) {
    throw new AuthError('ACCOUNT_LOCKED', 'Cuenta bloqueada temporalmente por múltiples intentos fallidos');
  }

  // Credenciales
  const ok = await verifyPassword(params.password, user.passHash);
  if (!ok) {
    await bumpFailed(user);
    throw new AuthError('INVALID_CREDENTIALS', 'Credenciales inválidas');
  }

  // Rehash si cambió política de rounds
  if (needsRehash(user.passHash)) {
    user.passHash = await hashPassword(params.password);
  }

  // MFA
  if (user.mfaEnabled) {
    if (!params.otpCode) throw new AuthError('MFA_REQUIRED', 'Se requiere código MFA');
    const mfaOk = verifyTotp(user, params.otpCode);
    if (!mfaOk) {
      await bumpFailed(user);
      throw new AuthError('MFA_INVALID', 'Código MFA inválido');
    }
  }

  // Reset contadores de fallos y lock
  user.failedLoginAttempts = 0;
  user.lockedUntil = 0;
  touchUpdated(user);
  await updateUser(user);

  // Crear sesión
  const session = createSession({
    id: randomUUID(),
    userId: user.id,
    ttlMinutes: params.ttlMinutes ?? DEFAULT_TTL_MIN,
    ipHash: params.ipHash,
    userAgent: params.userAgent,
  });
  await appendSession(session);

  return {
    session: toPublicSession(session),
    user: toPublicUser(user),
  };
}

/**
 * Logout: revoca la sesión (si está activa).
 */
export async function logoutSession(sessionId: string): Promise<ReturnType<typeof toPublicSession>> {
  const s = await getSessionById(sessionId);
  if (!s) throw new AuthError('SESSION_NOT_FOUND', 'Sesión no encontrada');
  if (!isActive(s)) throw new AuthError('SESSION_INACTIVE', 'La sesión ya no está activa');
  revokeSession(s);
  await updateSession(s);
  return toPublicSession(s);
}

/* ===================== MFA ===================== */

/**
 * Prepara MFA (TOTP). Genera un secreto y un otpauth URL (para QR).
 * No habilita MFA aún; eso se hace tras verify.
 */
export async function setupMfa(userId: string, issuer = 'AuthCLI'): Promise<{ secret: string; otpauth: string }> {
  const user = await getUserById(userId);
  if (!user) throw new AuthError('USER_NOT_FOUND');

  const secret = authenticator.generateSecret();
  const label = `${issuer}:${user.email}`;
  const otpauth = authenticator.keyuri(user.email, issuer, secret);

  user.mfaSecret = secret;
  user.mfaEnabled = false; // hasta verificar
  touchUpdated(user);
  await updateUser(user);

  return { secret, otpauth };
}

/**
 * Verifica MFA con un código TOTP; si es correcto, habilita MFA.
 */
export async function verifyMfa(userId: string, code: string): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) throw new AuthError('USER_NOT_FOUND');
  if (!user.mfaSecret) throw new AuthError('MFA_NOT_ENABLED', 'No hay secreto temporal, ejecuta setup primero');

  const ok = authenticator.verify({ token: code, secret: user.mfaSecret });
  if (ok) {
    user.mfaEnabled = true;
    touchUpdated(user);
    await updateUser(user);
  }
  return ok;
}

/* ===================== Helpers internos ===================== */

function verifyTotp(user: User, code: string): boolean {
  if (!user.mfaSecret) return false;
  return authenticator.verify({ token: code, secret: user.mfaSecret });
}

async function bumpFailed(user: User): Promise<void> {
  const fails = (user.failedLoginAttempts ?? 0) + 1;
  user.failedLoginAttempts = fails;

  if (fails >= MAX_FAILED) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60_000);
    user.lockedUntil = until.getTime();
  }
  touchUpdated(user);
  await updateUser(user);
}
