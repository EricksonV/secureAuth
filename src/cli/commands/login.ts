// src/cli/commands/login.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { loginUser } from '../../services/auth.services';
import { auditEvent } from '../../services/audit.services';

const cmd = new Command('auth:login')
  .description('Iniciar sesión')
  .requiredOption('-e, --email <email>', 'Email del usuario')
  .requiredOption('-p, --password <password>', 'Contraseña')
  .option('--otp <code>', 'Código TOTP si MFA está habilitado')
  .option('--ttl <minutes>', 'Duración de sesión en minutos', '60')
  .action(async (opts) => {
    const { email, password, otp } = opts;
    const ttlMinutes = Number(opts.ttl ?? 60);

    try {
      const { session, user } = await loginUser({
        email,
        password,
        otpCode: otp,
        ttlMinutes,
        // En CLI pura normalmente no tienes IP/UA; puedes omitirlos
        userAgent: 'auth-cli',
      });

      console.log(chalk.green('✅ Login ok'));
      console.log('Usuario:', { id: user.id, email: user.email, roles: user.roles, mfaEnabled: user.mfaEnabled });
      console.log('Sesión:', session);

      await auditEvent({
        action: 'auth.login',
        resource: 'auth',
        status: 'success',
        actor: { userId: user.id, email: user.email },
        sessionId: session.id,
        userAgent: 'auth-cli',
        meta: { ttlMinutes },
      });
    } catch (err: any) {
      console.error(chalk.red(`❌ Login fallido: ${err?.message || String(err)}`));
      await auditEvent({
        action: 'auth.login',
        resource: 'auth',
        status: 'fail',
        reason: err?.message || String(err),
        userAgent: 'auth-cli',
        meta: { email },
      });
      process.exit(1);
    }
  });

export default cmd;
