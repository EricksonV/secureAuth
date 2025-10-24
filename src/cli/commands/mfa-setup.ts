// src/cli/commands/mfa-setup.ts
import { Command } from 'commander';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import { setupMfa } from '../../services/auth.services';
import { auditEvent } from '../../services/audit.services';

const cmd = new Command('mfa:setup')
  .description('Configurar MFA (TOTP) para un usuario existente')
  .requiredOption('-u, --user-id <id>', 'ID del usuario')
  .option('-i, --issuer <name>', 'Nombre del emisor para mostrar en la app TOTP', 'AuthCLI')
  .action(async (opts) => {
    try {
      const { userId, issuer } = opts;
      const { secret, otpauth } = await setupMfa(userId, issuer);

      console.log(chalk.green('✅ MFA configurado (aún no verificado)'));
      console.log(chalk.cyan('Secreto:'), secret);
      console.log(chalk.gray('URL otpauth:'), otpauth);

      console.log(chalk.yellow('\nEscanea este código QR en Google Authenticator o Authy:'));
      qrcode.generate(otpauth, { small: true });

      await auditEvent({
        action: 'mfa.setup',
        resource: 'mfa',
        status: 'success',
        actor: { userId },
        targetId: userId,
        userAgent: 'auth-cli',
      });
    } catch (err: any) {
      console.error(chalk.red(`❌ Error configurando MFA: ${err?.message || String(err)}`));

      await auditEvent({
        action: 'mfa.setup',
        resource: 'mfa',
        status: 'fail',
        reason: err?.message || String(err),
        userAgent: 'auth-cli',
      });

      process.exit(1);
    }
  });

export default cmd;
