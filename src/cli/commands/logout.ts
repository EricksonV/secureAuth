// src/cli/commands/logout.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { logoutSession } from '../../services/auth.services';
import { auditEvent } from '../../services/audit.services';

const cmd = new Command('auth:logout')
  .description('Cerrar sesión por ID de sesión')
  .requiredOption('-s, --session <id>', 'ID de la sesión a revocar')
  .action(async (opts) => {
    const sessionId: string = String(opts.session).trim();

    try {
      const s = await logoutSession(sessionId);

      console.log(chalk.green('✅ Sesión revocada'));
      console.log({
        id: s.id,
        userId: s.userId,
        issuedAt: s.issuedAt,
        expiresAt: s.expiresAt,
        lastUsedAt: s.lastUsedAt,
        isActive: s.isActive,
      });

      await auditEvent({
        action: 'auth.logout',
        resource: 'auth',
        status: 'success',
        sessionId: s.id,
        userAgent: 'auth-cli',
        meta: { sessionId },
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error(chalk.red(`❌ Logout fallido: ${msg}`));

      await auditEvent({
        action: 'auth.logout',
        resource: 'auth',
        status: 'fail',
        reason: msg,
        userAgent: 'auth-cli',
        meta: { sessionId },
      });

      // Códigos útiles: 1 = error genérico, 2 = sesión no encontrada/inactiva
      if (err?.code === 'SESSION_NOT_FOUND' || err?.code === 'SESSION_INACTIVE') {
        process.exit(2);
      }
      process.exit(1);
    }
  });

export default cmd;
