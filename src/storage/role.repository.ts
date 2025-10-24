// src/storage/role.repository.ts
import {
  dataPath,
  readLines,
  writeLines,
  appendLine,
  touchFile,
  ensureData,
  safeJson,
} from './file.adapter';

import {
  type Role,
  type RoleName,
  createRole,
  isRoleName,
  isValidRole,
  normalizePermissions,
} from '../domain/role';

import { ROLE_PRESETS, type Permission, isPermission } from '../domain/permission';

const ROLES_FILE = dataPath('roles.txt');

/* ============== Internals ============== */

async function ensureRolesFile(): Promise<void> {
  await ensureData();
  await touchFile(ROLES_FILE);
}

function normalizeRoleRecord(obj: any): Role | null {
  if (!obj || typeof obj !== 'object') return null;

  // name
  const name = String(obj.name ?? '').trim();
  if (!name) return null;

  // permissions
  const perms: string[] = Array.isArray(obj.permissions) ? obj.permissions : [];
  const normalized = normalizePermissions(perms);

  const out: Role = {
    name: (isRoleName(name) ? (name as RoleName) : (name as any)),
    permissions: normalized,
    description: typeof obj.description === 'string' ? obj.description : undefined,
  };

  return isValidRole(out) ? out : null;
}

/* ============== Read APIs ============== */

export async function listRoles(): Promise<Role[]> {
  await ensureRolesFile();
  const lines = await readLines(ROLES_FILE);

  const out: Role[] = [];
  for (const ln of lines) {
    const parsed = safeJson<Role>(ln);
    const norm = normalizeRoleRecord(parsed);
    if (norm) out.push(norm);
  }
  return out;
}

export async function getRoleByName(name: string): Promise<Role | null> {
  const roles = await listRoles();
  return roles.find(r => String(r.name).trim() === String(name).trim()) ?? null;
}

/* ============== Write APIs ============== */

/**
 * Crea o actualiza un rol por nombre.
 * - Si existe, reemplaza sus permisos/description con los provistos (normalizados).
 * - Si no existe, lo inserta.
 */
export async function upsertRole(params: {
  name: string;
  permissions?: ReadonlyArray<string>;
  description?: string | undefined;
}): Promise<Role> {
  const name = String(params.name).trim();
  if (!name) throw new Error('ROLE_NAME_REQUIRED');

  const perms = normalizePermissions(params.permissions ?? []);

  // Cargar todo, modificar o insertar
  const all = await listRoles();
  let found = false;
  const updated = all.map(r => {
    if (String(r.name).trim() === name) {
      found = true;
      const next: Role = {
        name: (isRoleName(name) ? (name as RoleName) : (name as any)),
        permissions: perms,
        description: params.description ?? r.description,
      };
      return next;
    }
    return r;
  });

  if (!found) {
    const next: Role = {
      name: (isRoleName(name) ? (name as RoleName) : (name as any)),
      permissions: perms,
      description: params.description,
    };
    updated.push(next);
  }

  // Validar todos antes de escribir
  for (const r of updated) {
    if (!isValidRole(r)) throw new Error('INVALID_ROLE_RECORD');
  }

  await writeLines(ROLES_FILE, updated.map(r => JSON.stringify(r)));
  return (await getRoleByName(name)) as Role;
}

/**
 * Inserta rápidamente un rol nuevo (falla si ya existe).
 */
export async function addRole(role: Role): Promise<void> {
  if (!isValidRole(role)) throw new Error('INVALID_ROLE_RECORD');
  const existing = await getRoleByName(String(role.name));
  if (existing) throw new Error('ROLE_ALREADY_EXISTS');
  await appendLine(ROLES_FILE, JSON.stringify(role));
}

/**
 * Elimina un rol por nombre. Retorna true si eliminó algo.
 */
export async function deleteRole(name: string): Promise<boolean> {
  const all = await listRoles();
  const remaining = all.filter(r => String(r.name).trim() !== String(name).trim());
  const changed = remaining.length !== all.length;
  if (changed) {
    await writeLines(ROLES_FILE, remaining.map(r => JSON.stringify(r)));
  }
  return changed;
}

/* ============== Seeds & Helpers ============== */

/**
 * Semilla opcional: si el archivo está vacío, escribe los ROLE_PRESETS.
 * - Usa exactamente los permisos definidos en permission.ts para cada preset.
 * - No sobreescribe si ya existen roles en el archivo.
 */
export async function seedRolePresetsIfEmpty(): Promise<void> {
  await ensureRolesFile();
  const curr = await listRoles();
  if (curr.length > 0) return;

  const toWrite: Role[] = Object.entries(ROLE_PRESETS).map(([name, perms]) =>
    createRole({
      name,
      description: `Preset ${name}`,
      extraPermissions: perms, // createRole los normaliza
    })
  );

  await writeLines(ROLES_FILE, toWrite.map(r => JSON.stringify(r)));
}

/**
 * Agrega permisos extras a un rol existente, manteniendo únicos/ordenados.
 */
export async function addPermissionsToRole(name: string, extras: ReadonlyArray<string>): Promise<Role> {
  const current = await getRoleByName(name);
  if (!current) throw new Error('ROLE_NOT_FOUND');

  const merged = normalizePermissions([...(current.permissions ?? []), ...extras]);
  return upsertRole({ name, permissions: merged, description: current.description });
}

/**
 * Reemplaza permisos de un rol con una lista “limpia”.
 */
export async function replaceRolePermissions(name: string, permissions: ReadonlyArray<string>): Promise<Role> {
  const perms = normalizePermissions(permissions);
  return upsertRole({ name, permissions: perms });
}
