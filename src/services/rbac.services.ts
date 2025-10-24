// src/services/rbac.service.ts
import type { Permission } from '../domain/permission';
import { hasAllPermissions, hasAnyPermission } from '../domain/permission';
import { getEffectivePermissions, type User } from '../domain/user';
import type { Role } from '../domain/role';

/**
 * Devuelve true si el usuario posee TODOS los permisos requeridos.
 * Puedes pasar un catálogo de roles custom si cargas roles desde archivo.
 */
export function userHasAll(
  user: Pick<User, 'roles' | 'extraPermissions'>,
  requiredAll: ReadonlyArray<Permission>,
  roleCatalog?: ReadonlyArray<Role>
): boolean {
  const granted = getEffectivePermissions(user, roleCatalog);
  return hasAllPermissions(granted, requiredAll);
}

/**
 * Devuelve true si el usuario posee ALGUNO de los permisos requeridos.
 */
export function userHasAny(
  user: Pick<User, 'roles' | 'extraPermissions'>,
  requiredAny: ReadonlyArray<Permission>,
  roleCatalog?: ReadonlyArray<Role>
): boolean {
  const granted = getEffectivePermissions(user, roleCatalog);
  return hasAnyPermission(granted, requiredAny);
}

/**
 * Lanza error si faltan permisos (modo “assert”).
 */
export function assertAllPermissions(
  user: Pick<User, 'roles' | 'extraPermissions'>,
  requiredAll: ReadonlyArray<Permission>,
  roleCatalog?: ReadonlyArray<Role>
): void {
  if (!userHasAll(user, requiredAll, roleCatalog)) {
    const missing = requiredAll.join(', ');
    throw new Error(`Permisos insuficientes. Requiere: [${missing}]`);
  }
}

export function assertAnyPermission(
  user: Pick<User, 'roles' | 'extraPermissions'>,
  requiredAny: ReadonlyArray<Permission>,
  roleCatalog?: ReadonlyArray<Role>
): void {
  if (!userHasAny(user, requiredAny, roleCatalog)) {
    const list = requiredAny.join(', ');
    throw new Error(`Permisos insuficientes. Requiere alguno de: [${list}]`);
  }
}
