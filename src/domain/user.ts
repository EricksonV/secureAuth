// src/domain/user.ts
import type { Permission } from './permission';
import { hasPermission, PERMISSIONS, isPermission } from './permission';
import { createRole, getPresetPermissions, isRoleName, mergeRolesPermissions, type Role } from './role';

/**
 * Representa a un usuario en el dominio.
 * NOTA: Las credenciales sensibles viven aquí; NO expongas este objeto fuera.
 */
export interface User {
  id: string;                  // UUID/ulid/lo que uses
  email: string;
  passHash: string;            // hash de bcrypt u otro
  salt?: string;               // si usas esquema con salt explícita
  roles: string[];             // nombres de rol (p. ej., ['user', 'support'])
  extraPermissions: Permission[]; // permisos adicionales por usuario (opcionales)
  mfaEnabled?: boolean | undefined;
  mfaSecret: string | undefined;          // TOTP secret (base32) - almacenar cifrado si es posible
  recoveryCodes: string[] | undefined;    // (opcional) códigos de recuperación MFA (idealmente hashed)
  failedLoginAttempts?: number;
  lockedUntil?: number;        // epoch ms si la cuenta está bloqueada por rate limit
  createdAt: string;           // ISO-8601
  updatedAt: string;           // ISO-8601
}

/**
 * Representación segura para impresión/retorno en CLI (sin secretos).
 */
export interface PublicUser {
  id: string;
  email: string;
  roles: string[];
  permissions: Permission[];   // permisos efectivos calculados
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Crea un usuario de forma puramente estructural (sin hashear).
 * El hashing de contraseña debe hacerse en auth/password.service.ts
 */
export function createUser(params: {
  id: string;
  email: string;
  passHash: string;                  // ya hasheada afuera
  roles: string[];
  extraPermissions: string[];
  mfaEnabled?: boolean | undefined;
  mfaSecret?: string | undefined;
  recoveryCodes?: string[] | undefined;
  now?: Date | undefined;
}): User {
  const now = (params.now ?? new Date()).toISOString();
  const normalizedExtras = normalizePermissions(params.extraPermissions ?? []);
  return {
    id: params.id,
    email: normalizeEmail(params.email),
    passHash: params.passHash,
    roles: normalizeRoles(params.roles ?? ['user']),
    extraPermissions: normalizedExtras,
    mfaEnabled: params.mfaEnabled ?? false,
    mfaSecret: params.mfaSecret,
    recoveryCodes: params.recoveryCodes,
    failedLoginAttempts: 0,
    lockedUntil: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Devuelve una vista pública (safe) del usuario.
 */
export function toPublicUser(u: User, roleCatalog?: ReadonlyArray<Role>): PublicUser {
  const perms = getEffectivePermissions(u, roleCatalog);
  return {
    id: u.id,
    email: u.email,
    roles: [...u.roles],
    permissions: perms,
    mfaEnabled: !!u.mfaEnabled,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/**
 * Calcula los permisos efectivos a partir de:
 *  - Roles (presets) +
 *  - extraPermissions del usuario (si existen)
 *
 * Puedes pasar un catálogo de roles custom (definidos en archivo/seed).
 * Si no pasas nada, usa los presets embebidos (ROLE_PRESETS vía createRole/getPresetPermissions).
 */
export function getEffectivePermissions(
  user: Pick<User, 'roles' | 'extraPermissions'>,
  roleCatalog?: ReadonlyArray<Role>
): Permission[] {
  // 1) permisos por roles
  const rolesFromCatalog: Role[] = [];

  if (roleCatalog && roleCatalog.length) {
    // Buscar coincidencias exactas de nombre en el catálogo provisto
    for (const rName of user.roles) {
      const r = roleCatalog.find(r => r.name === rName);
      if (r) rolesFromCatalog.push(r);
      else if (isRoleName(rName)) rolesFromCatalog.push(createRole({ name: rName })); // fallback a preset
    }
  } else {
    // Sin catálogo externo: usar presets conocidos; si no es preset, rol queda vacío (custom sin permisos)
    for (const rName of user.roles) {
      if (isRoleName(rName)) {
        rolesFromCatalog.push(createRole({ name: rName }));
      } else {
        // Custom role sin permisos predefinidos
        rolesFromCatalog.push({ name: rName, permissions: [] });
      }
    }
  }

  const merged = mergeRolesPermissions([
    ...rolesFromCatalog,
    user.extraPermissions ?? [],
  ]);

  return merged;
}

/**
 * Verifica si el usuario posee un permiso requerido.
 */
export function userCan(
  user: Pick<User, 'roles' | 'extraPermissions'>,
  required: Permission,
  roleCatalog?: ReadonlyArray<Role>
): boolean {
  const perms = getEffectivePermissions(user, roleCatalog);
  return hasPermission(perms, required);
}

/**
 * Normaliza/valida roles (quita vacíos/espacios/duplicados).
 */
export function normalizeRoles(roles: ReadonlyArray<string>): string[] {
  const set = new Set(
    roles
      .map(r => r.trim())
      .filter(Boolean)
  );
  return Array.from(set);
}

/**
 * Normaliza permisos extra: valida y quita duplicados.
 */
export function normalizePermissions(perms: ReadonlyArray<string>): Permission[] {
  const set = new Set<Permission>();
  for (const p of perms) {
    if (isPermission(p)) set.add(p);
  }

  // índice de orden por string con fallback (comodines al final)
  const orderIndex: Record<string, number> = Object.fromEntries(
    (PERMISSIONS as ReadonlyArray<string>).map((p, i) => [p, i])
  ) as Record<string, number>;

  return Array.from(set).sort((a, b) => {
    const ai = orderIndex[a as string] ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex[b as string] ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

/**
 * Utilidades de validación ligera (puedes moverlas a utils/validator.util.ts si prefieres)
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  // Suficiente para CLI básica (puedes endurecer luego)
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(normalizeEmail(email));
}

/**
 * Helper para “tocar” updatedAt cuando cambies algo del usuario.
 */
export function touchUpdated(u: User, when = new Date()): void {
  u.updatedAt = when.toISOString();
}

/* ====== Ejemplos de uso ======
import { createUser, getEffectivePermissions, userCan } from './user';

const u = createUser({
  id: 'u_123',
  email: 'alice@example.com',
  passHash: '<bcrypt-hash>',
  roles: ['user', 'support'],
  extraPermissions: ['user:update'],
});

const perms = getEffectivePermissions(u);
console.log(perms);

const canAssign = userCan(u, 'role:assign'); // false en presets por defecto
console.log({ canAssign });
================================ */
