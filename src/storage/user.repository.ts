// src/storage/user.repository.ts
import { dataPath, readLines, appendLine, writeLines, safeJson, ensureData, touchFile } from './file.adapter';
import type { User } from '../domain/user';
import { normalizeEmail, isValidEmail } from '../domain/user';

const USERS_FILE = dataPath('users.txt');

/** Asegura que el archivo existe */
async function ensureUsersFile(): Promise<void> {
  await ensureData();
  await touchFile(USERS_FILE);
}

function isLikelyUser(obj: any): obj is User {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.email === 'string' &&
    typeof obj.passHash === 'string' &&
    Array.isArray(obj.roles) &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
}

/** Devuelve todos los usuarios (carga completa). Para CLI es suficiente. */
export async function listUsers(): Promise<User[]> {
  await ensureUsersFile();
  const lines = await readLines(USERS_FILE);
  const out: User[] = [];
  for (const ln of lines) {
    const u = safeJson<User>(ln);
    if (u && isLikelyUser(u)) out.push(u);
  }
  return out;
}

/** Busca por ID */
export async function getUserById(id: string): Promise<User | null> {
  const users = await listUsers();
  return users.find(u => u.id === id) ?? null;
}

/** Busca por email (normalizado) */
export async function getUserByEmail(email: string): Promise<User | null> {
  const target = normalizeEmail(email);
  if (!isValidEmail(target)) return null;
  const users = await listUsers();
  return users.find(u => normalizeEmail(u.email) === target) ?? null;
}

/** Inserta un usuario nuevo (sin duplicar email). */
export async function addUser(user: User): Promise<void> {
  // Doble-check de duplicado por email
  const existing = await getUserByEmail(user.email);
  if (existing) throw new Error('EMAIL_ALREADY_EXISTS');
  await appendLine(USERS_FILE, JSON.stringify(user));
}

/**
 * Actualiza un usuario por id: reescribe el archivo.
 * Estrategia simple (carga todo, sustituye 1 y escribe).
 */
export async function updateUser(updated: User): Promise<void> {
  const users = await listUsers();
  let found = false;
  const newLines = users.map(u => {
    if (u.id === updated.id) {
      found = true;
      return JSON.stringify(updated);
    }
    return JSON.stringify(u);
  });
  if (!found) throw new Error('USER_NOT_FOUND');
  await writeLines(USERS_FILE, newLines);
}
