// src/services/password.service.ts
import bcrypt from 'bcrypt';

const SALT_ROUNDS = Number(process.env.HASH_SALT_ROUNDS ?? 10);

/**
 * Hashea una contraseña usando bcrypt con sal aleatoria.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(plain, salt);
}

/**
 * Verifica si la contraseña en texto plano coincide con el hash almacenado.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Devuelve true si el hash actual debería re-hashearse (p. ej., aumentaste los rounds).
 */
export function needsRehash(hash: string): boolean {
  try {
    // @ts-ignore - getRounds existe en @types/bcrypt
    const rounds: number = bcrypt.getRounds(hash);
    return rounds < SALT_ROUNDS;
  } catch {
    // Si no se puede leer, forzamos rehahsear
    return true;
  }
}

/**
 * Valida fortaleza de contraseña básica para CLI.
 * Puedes endurecer reglas (longitud mínima, clases de caracteres, etc.)
 */
export function validatePasswordStrength(pass: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (pass.length < 8) errors.push('Debe tener al menos 8 caracteres');
  if (!/[a-z]/.test(pass)) errors.push('Debe incluir una letra minúscula');
  if (!/[A-Z]/.test(pass)) errors.push('Debe incluir una letra mayúscula');
  if (!/[0-9]/.test(pass)) errors.push('Debe incluir un dígito');
  if (!/[^\w\s]/.test(pass)) errors.push('Debe incluir un símbolo (p. ej., !@#$%)');
  return { ok: errors.length === 0, errors };
}
