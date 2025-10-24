// src/cli/index.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { seedRolePresetsIfEmpty } from '../storage/role.repository';

// Comandos
import registerCmd from './commands/register';
import loginCmd from './commands/login';
import logoutCmd from './commands/logout'; 
import roleListCmd from './commands/role-list';
import mfaSetupCmd from './commands/mfa-setup';
import mfaVerifyCmd from './commands/mfa-verify';

async function bootstrap() {
  // Semilla de roles si el archivo está vacío
  await seedRolePresetsIfEmpty();
}

async function main() {
  await bootstrap();

  const program = new Command();
  program
    .name('auth-cli')
    .description('CLI de autenticación/autorization con TS + archivos .txt')
    .version('0.1.0');

  // Registrar comandos
  program.addCommand(registerCmd);
  program.addCommand(loginCmd);
  program.addCommand(roleListCmd);
  program.addCommand(logoutCmd);
  program.addCommand(mfaSetupCmd);
  program.addCommand(mfaVerifyCmd);

  // Manejo de errores genéricos
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}

main();
