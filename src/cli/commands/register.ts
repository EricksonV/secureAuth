// src/cli/commands/register.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { registerUser } from '../../services/auth.services';
import { auditEvent } from '../../services/audit.services';

const cmd = new Command('auth:register')
  .description('Registrar un usuario')
  .requiredOption('-e, --email <email>', 'Email del usuario')
  .requiredOption('-p, --password <password>', 'Contraseña del usuario')
  .option('-r, --roles <roles>', 'Roles separados por coma (ej.: user,support)', 'user')
  .action(async (opts) => {
    const { email, password } = opts;
    const roles: string[] = String(opts.roles || 'user')
      .split(',')
      .map((r: string) => r.trim())
      .filter(Boolean);

    try {
      const user = await registerUser({ email, password, roles });
      console.log(chalk.green('✅ Usuario registrado:'));
      console.log({
        id: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
        mfaEnabled: user.mfaEnabled,
      });

      await auditEvent({
        action: 'user.register',
        resource: 'user',
        status: 'success',
        actor: { userId: user.id, email: user.email },
        targetId: user.id,
        userAgent: 'auth-cli',
        meta: { roles },
      });
    } catch (err: any) {
      console.error(chalk.red(`❌ Registro fallido: ${err?.message || String(err)}`));
      await auditEvent({
        action: 'user.register',
        resource: 'user',
        status: 'fail',
        reason: err?.message || String(err),
        userAgent: 'auth-cli',
        meta: { email },
      });
      process.exit(1);
    }
  });

export default cmd;
