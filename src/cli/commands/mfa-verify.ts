// src/cli/commands/mfa-verify.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { verifyMfa } from '../../services/auth.services';
import { auditEvent } from '../../services/audit.services';

const cmd = new Command('mfa:verify')
  .description('Verificar código TOTP y habilitar MFA para el usuario')
  .requiredOption('-u, --user-id <id>', 'ID del usuario')
  .requiredOption('-c, --code <totp>', 'Código TOTP actual (6 dígitos)')
  .action(async (opts) => {
    const { userId, code } = opts;

    try {
      const ok = await verifyMfa(userId, code);
      if (!ok) {
        console.log(chalk.yellow('⚠️ Código TOTP inválido. Vuelve a intentarlo.'));
        process.exit(2);
      }

      console.log(chalk.green('✅ MFA verificado y habilitado correctamente.'));

      await auditEvent({
        action: 'mfa.verify',
        resource: 'mfa',
        status: 'success',
        actor: { userId },
        targetId: userId,
        userAgent: 'auth-cli',
      });
    } catch (err: any) {
      console.error(chalk.red(`❌ Error verificando MFA: ${err?.message || String(err)}`));

      await auditEvent({
        action: 'mfa.verify',
        resource: 'mfa',
        status: 'fail',
        reason: err?.message || String(err),
        userAgent: 'auth-cli',
      });

      process.exit(1);
    }
  });

export default cmd;
