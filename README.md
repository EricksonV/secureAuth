# 🧩 Secure Auth CLI – Proyecto de Autenticación y Autorización en Node.js + TypeScript

Un sistema de **autenticación segura**, **autorización por roles (RBAC)** y **autenticación multifactor (MFA/TOTP)** desarrollado en **Node.js** con **TypeScript**, ejecutado completamente por **consola** y persistiendo los datos en archivos `.txt` (sin base de datos).

---

## ⚙️ Características principales

- ✅ Registro y login de usuarios por CLI  
- ✅ Contraseñas seguras (hash + salting con `bcryptjs`)  
- ✅ Control de acceso basado en roles (RBAC)  
- ✅ MFA (autenticación de dos factores) con TOTP (Google Authenticator)  
- ✅ Sesiones seguras almacenadas en archivo  
- ✅ Auditoría de acciones (`logs/audit.log`)  
- ✅ 100% por consola — sin base de datos ni servidor web  

---

## 🧠 Detalles Técnicos

- **🔐 Hash de contraseñas:**  
  Se utiliza `bcrypt.hash(password, saltRounds)` para asegurar las contraseñas antes de guardarlas.  
  Cada contraseña se encripta con una sal única, garantizando que dos contraseñas iguales generen hashes diferentes.

- **🕒 Sesiones:**  
  Se almacenan en `data/sessions.txt` con los campos principales:
  - `issuedAt`: fecha y hora de creación.  
  - `expiresAt`: fecha de expiración.  
  - `revokedAt`: fecha de cierre (si aplica).  
  - `isActive`: indica si la sesión sigue válida.  

- **🧩 Roles y permisos:**  
  Definidos en `domain/permission.ts` y `domain/role.ts`, permiten aplicar **control de acceso basado en roles (RBAC)**.  
  Cada rol agrupa permisos predefinidos, y el usuario puede tener permisos extra personalizados.

- **🧾 Auditoría:**  
  Todas las acciones críticas (login, logout, MFA, registro, errores) se registran en `logs/audit.log` con formato **JSONL**.  
  Cada línea representa un evento con `timestamp`, `actor`, `acción`, `estado` y metadatos.

- **💾 Persistencia:**  
  Todos los datos se almacenan en **archivos `.txt`** con formato **JSONL (JSON por línea)**:
  - `data/users.txt` → usuarios  
  - `data/sessions.txt` → sesiones  
  - `data/roles.txt` → roles y permisos  
  - `logs/audit.log` → auditoría de acciones  
  Este enfoque evita el uso de bases de datos y facilita su uso en entornos de laboratorio o demostraciones.

---

## 🏗️ Estructura del proyecto
    src/
    ├─ cli/
    │ ├─ index.ts # Punto de entrada CLI
    │ └─ commands/ # Comandos disponibles
    │ ├─ auth:register.ts
    │ ├─ auth:login.ts
    │ ├─ auth:logout.ts
    │ ├─ role-list.ts
    │ ├─ mfa-setup.ts
    │ ├─ mfa-verify.ts
    ├─ domain/ # Modelos de dominio
    │ ├─ user.ts
    │ ├─ role.ts
    │ ├─ permission.ts
    │ └─ session.ts
    ├─ services/ # Lógica de negocio
    │ ├─ auth.service.ts
    │ ├─ password.service.ts
    │ ├─ audit.service.ts
    │ └─ rbac.service.ts
    ├─ storage/ # Repositorios (lectura/escritura .txt)
    │ ├─ file.adapter.ts
    │ ├─ user.repository.ts
    │ ├─ session.repository.ts
    │ └─ role.repository.ts
    ├─ data/ # Archivos persistentes (.txt)
    │ ├─ users.txt
    │ ├─ sessions.txt
    │ └─ roles.txt
    └─ logs/ # Registros de auditoría
    ├─ audit.log
    └─ app.log


---

## 🧰 Librerías utilizadas

| Librería | Propósito |
|-----------|------------|
| **TypeScript** | Lenguaje tipado sobre JavaScript |
| **ts-node** | Ejecutar TypeScript directamente sin compilar |
| **commander** | Crear comandos CLI (`auth:login`, `mfa:setup`, etc.) |
| **chalk** | Colores bonitos en la consola |
| **bcryptjs** | Hash y salting de contraseñas |
| **otplib** | Generación y verificación de códigos TOTP (MFA) |
| **qrcode-terminal** | Mostrar códigos QR directamente en la terminal |
| **uuid** | Generar identificadores únicos (para usuarios y sesiones) |
| **fs/promises** | Lectura y escritura de archivos `.txt` |
| **crypto** | Generar hashes y firmas seguras para IPs o tokens |
| **path** | Resolver rutas de archivos en el sistema operativo |

---

## 🧾 Comandos disponibles

| Comando | Descripción | Ejemplo |
|----------|--------------|---------|
| **`auth:register`** | Registra un nuevo usuario con roles definidos. | `npm run dev -- auth:register -e alice@example.com -p "S3gura!2024" -r user` |
| **`auth:login`** | Inicia sesión de usuario y crea una sesión activa. | `npm run dev -- auth:login -e alice@example.com -p "S3gura!2024"` |
| **`auth:logout`** | Revoca (cierra) una sesión activa. | `npm run dev -- auth:logout --session <ID_SESION>` |
| **`role:list`** | Muestra los roles existentes y sus permisos. | `npm run dev -- role:list` |
| **`mfa:setup`** | Genera el secreto TOTP y muestra el QR para Authenticator. | `npm run dev -- mfa:setup -u <USER_ID>` |
| **`mfa:verify`** | Verifica el código TOTP y habilita MFA para el usuario. | `npm run dev -- mfa:verify -u <USER_ID> -c 123456` |
| **`auth:login --otp`** | Inicia sesión con MFA habilitado. | `npm run dev -- auth:login -e alice@example.com -p "S3gura!2024" --otp 123456` |

---

## 🧩 Explicación de parámetros

| Flag | Nombre largo | Significado |
|------|---------------|-------------|
| `-e` | `--email` | Correo electrónico del usuario. |
| `-p` | `--password` | Contraseña del usuario. |
| `-r` | `--roles` | Roles asignados (ej. `user,admin`). |
| `-u` | `--user-id` | ID del usuario (UUID). |
| `-c` | `--code` | Código TOTP de 6 dígitos. |
| `--otp` | | Código MFA usado en el login. |
| `--session` | | ID de sesión para cerrar (logout). |

---

## 🔐 Flujo completo de autenticación

1️⃣ **Registrar usuario**
```bash
npm run dev -- auth:register -e alice@example.com -p "S3gura!2024" -r user
```
2️⃣ **Login inicial**
```bash
npm run dev -- auth:login -e alice@example.com -p "S3gura!2024"
```
3️⃣ **Configurar MFA**
```bash
npm run dev -- mfa:setup -u <USER_ID>
```
4️⃣ **Verificar MFA**
```bash
npm run dev -- mfa:verify -u <USER_ID> -c 123456
```
5️⃣ **Login con MFA activo**
```bash
npm run dev -- auth:login -e alice@example.com -p "S3gura!2024" --otp 123456
```
6️⃣ **Logout**
```bash
npm run dev -- auth:logout --session <SESSION_ID>
```



