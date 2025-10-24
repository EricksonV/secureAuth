// src/domain/role.ts
import {
  type Permission,
  ROLE_PRESETS,
  PERMISSIONS,
  isPermission,
} from './permission';

/**
 * Nombres de rol soportados por la app.
 * Deben coincidir con las llaves de ROLE_PRESETS.
 */
export type RoleName = keyof typeof ROLE_PRESETS; // 'admin' | 'security-analyst' | 'support' | 'user'

/**
 * Representación de un rol.
 * Un rol puede traer permisos explícitos (custom) además de los del preset.
 */
export interface Role {
  name: RoleName | (string & {}); // Permitimos custom names si luego decides soportarlos
  permissions: Permission[];      // Permisos efectivos del rol (preset + extras)
  description?: string | undefined;
  // Ej.: "Rol de administración con acceso total a gestión de usuarios y sesiones"
}

/**
 * Devuelve los permisos del preset para un nombre de rol conocido.
 * Si el rol no existe en los presets, devuelve [].
 */
export function getPresetPermissions(name: string): ReadonlyArray<Permission> {
  if (isRoleName(name)) return ROLE_PRESETS[name];
  return [];
}

/**
 * Verifica si un string es un RoleName soportado.
 */
export function isRoleName(name: string): name is RoleName {
  return Object.prototype.hasOwnProperty.call(ROLE_PRESETS, name);
}

/**
 * Valida un arreglo de permisos asegurando que:
 *  - Todos pertenecen al catálogo PERMISSIONS o al patrón válido (ya verificado por isPermission)
 *  - No hay duplicados
 * Retorna una versión normalizada (orden estable + únicos).
 */
export function normalizePermissions(perms: ReadonlyArray<string>): Permission[] {
  const unique = new Set<Permission>();
  for (const p of perms) {
    if (isPermission(p)) unique.add(p);
  }

  // Índice de orden por string para evitar choque de tipos con comodines (p.ej. "user:*")
  const orderIndex: Record<string, number> = Object.fromEntries(
    (PERMISSIONS as ReadonlyArray<string>).map((p, i) => [p, i])
  ) as Record<string, number>;

  return Array.from(unique).sort((a, b) => {
    const ai = orderIndex[a as string] ?? Number.MAX_SAFE_INTEGER; // comodines al final
    const bi = orderIndex[b as string] ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

/**
 * Crea un rol a partir de un nombre y permisos adicionales opcionales.
 * - Si el nombre es un preset, incluye los permisos del preset.
 * - 'extraPermissions' permite extender el rol.
 */
export function createRole(params: {
  name: string;
  description?: string;
  extraPermissions?: ReadonlyArray<string>;
}): Role {
  const base = getPresetPermissions(params.name);
  const extras = params.extraPermissions ?? [];
  const merged = normalizePermissions([...base, ...extras]);

  const roleBase: Role = {
    name: (isRoleName(params.name) ? params.name : (params.name as any)),
    permissions: merged,
  };

  // Solo agrega la propiedad si viene definida
  if (params.description !== undefined) {
    (roleBase as any).description = params.description;
  }

  return roleBase;
}

/**
 * Fusiona múltiples roles (y/o permisos sueltos) en un conjunto de permisos efectivo.
 * Útil cuando un usuario tiene varios roles asignados.
 */
function isRole(x: unknown): x is Role {
  return !!x && typeof x === 'object' && 'permissions' in (x as any);
}

export function mergeRolesPermissions(inputs: Array<Role | ReadonlyArray<string>>): Permission[] {
  const all: string[] = [];
  for (const i of inputs) {
    if (isRole(i)) all.push(...i.permissions);
    else all.push(...i); // es ReadonlyArray<string>
  }
  return normalizePermissions(all);
}

/**
 * Valida un objeto role "básico".
 */
export function isValidRole(obj: any): obj is Role {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.name !== 'string') return false;
  if (!Array.isArray(obj.permissions)) return false;
  // Todos los permisos deben ser válidos
  return obj.permissions.every((p: any) => typeof p === 'string' && isPermission(p));
}

/* ========= Ejemplos de uso (referencia) =========
import { createRole, mergeRolesPermissions } from './role';

const admin = createRole({ name: 'admin', description: 'Administrador del sistema' });
const support = createRole({ name: 'support', extraPermissions: ['user:update'] });

// Permisos efectivos si un usuario tiene admin + support
const effective = mergeRolesPermissions([admin, support]);
console.log(effective);
================================================== */
