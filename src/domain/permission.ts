// src/domain/permission.ts

/**
 * Recursos que administra tu CLI.
 * Puedes agregar/quitar según crezca el proyecto.
 */
export type Resource =
  | 'user'     // gestión de usuarios (registro, lectura, edición, borrado)
  | 'role'     // gestión de roles y asignación
  | 'session'  // manejo de sesiones/tokens
  | 'mfa'      // activación/verificación de MFA
  | 'auth'     // login/logout
  | 'audit'    // lectura de auditoría
  | 'oauth';   // (opcional) flujos device/code

/**
 * Acciones estándar por recurso.
 * Agrega más si lo necesitas (p. ej., 'export', 'import', etc.).
 */
export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'assign'   // para role: asignar roles
  | 'verify'   // para mfa: verificar código
  | 'setup'    // para mfa: alta/config
  | 'login'    // para auth
  | 'logout'   // para auth
  | 'list'     // listar
  | 'invalidate' // invalidar sesiones
  | 'rotate';  // rotar llaves/secretos

/**
 * Un permiso es "recurso:acción" o "recurso:*" (comodín por acción).
 * Ejemplos: "user:create", "user:*", "role:assign".
 */
export type Permission = `${Resource}:${Action | '*'}`;

/**
 * Conjunto canónico de permisos soportados por la app.
 * Útil para validar entradas y para autocompletar/ayuda.
 */
export const PERMISSIONS = [
  // user
  'user:create',
  'user:read',
  'user:update',
  'user:delete',
  'user:list',
  // role
  'role:read',
  'role:list',
  'role:assign',
  // session
  'session:read',
  'session:list',
  'session:invalidate',
  // mfa
  'mfa:setup',
  'mfa:verify',
  // auth
  'auth:login',
  'auth:logout',
  // audit
  'audit:read',
  // oauth (opcional)
  'oauth:read',
  'oauth:list',
  'oauth:delete',
] as const satisfies readonly Permission[];

/**
 * Valida que una cadena cumpla el patrón "recurso:acción|*"
 * y que el recurso y acción sean conocidos por la app.
 */
export function isPermission(value: string): value is Permission {
  const [res, act] = value.split(':');
  if (!res || !act) return false;

  const validResource = VALID_RESOURCES.has(res as Resource);
  if (!validResource) return false;

  if (act === '*') return true;
  return VALID_ACTIONS.has(act as Action) && ALL_PERMISSIONS_SET.has(`${res}:${act}` as Permission);
}

/**
 * Determina si un permiso otorgado (grant) implica el requerido (required).
 * Soporta comodín por acción: "user:*" ⇒ implica "user:read", "user:update", etc.
 * No existe comodín global "*:*" por simplicidad/seguridad.
 */
export function permissionImplies(grant: Permission, required: Permission): boolean {
  const [gRes, gAct] = grant.split(':');
  const [rRes, rAct] = required.split(':');

  if (gRes !== rRes) return false;
  // mismo recurso
  if (gAct === '*') return true;         // comodín cubre cualquier acción del recurso
  return gAct === rAct;                  // acción exacta
}

/**
 * Verifica si una colección de permisos concedidos cubre un permiso requerido.
 */
export function hasPermission(granted: Permission[] | ReadonlyArray<Permission>, required: Permission): boolean {
  for (const g of granted) {
    if (permissionImplies(g, required)) return true;
  }
  return false;
}

/**
 * Azúcar sintáctico: permite chequear varios permisos (AND/OR).
 */
export function hasAllPermissions(granted: ReadonlyArray<Permission>, requiredAll: ReadonlyArray<Permission>): boolean {
  return requiredAll.every(req => hasPermission(granted, req));
}

export function hasAnyPermission(granted: ReadonlyArray<Permission>, requiredAny: ReadonlyArray<Permission>): boolean {
  return requiredAny.some(req => hasPermission(granted, req));
}

/**
 * Presets de permisos por rol (útil para semilla y para CLI).
 * Puedes mover esto a role.ts si prefieres, pero aquí es práctico para iniciar.
 */
export const ROLE_PRESETS: Record<
  'admin' | 'security-analyst' | 'support' | 'user',
  ReadonlyArray<Permission>
> = {
  admin: [
    'user:*',
    'role:assign',
    'role:read',
    'role:list',
    'session:list',
    'session:invalidate',
    'mfa:setup',
    'mfa:verify',
    'auth:login',
    'auth:logout',
    'audit:read',
    'oauth:list',
    'oauth:read',
    'oauth:delete',
  ],
  'security-analyst': [
    'user:read',
    'user:list',
    'role:read',
    'role:list',
    'session:list',
    'session:read',
    'session:invalidate',
    'audit:read',
  ],
  support: [
    'user:read',
    'user:list',
    'mfa:verify',
    'auth:login',
    'auth:logout',
  ],
  user: [
    'auth:login',
    'auth:logout',
    'mfa:setup',
    'mfa:verify',
    'user:read',
    'user:update',
  ],
} as const;

/* ===== Internals ===== */

const VALID_RESOURCES: ReadonlySet<Resource> = new Set([
  'user',
  'role',
  'session',
  'mfa',
  'auth',
  'audit',
  'oauth',
]);

const VALID_ACTIONS: ReadonlySet<Action> = new Set([
  'create',
  'read',
  'update',
  'delete',
  'assign',
  'verify',
  'setup',
  'login',
  'logout',
  'list',
  'invalidate',
  'rotate',
]);

const ALL_PERMISSIONS_SET: ReadonlySet<Permission> = new Set(PERMISSIONS as ReadonlyArray<Permission>);
