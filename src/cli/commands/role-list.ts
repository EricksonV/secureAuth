// src/cli/commands/role-list.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { listRoles } from '../../storage/role.repository';

const cmd = new Command('role:list')
  .description('Listar roles disponibles')
  .action(async () => {
    try {
      const roles = await listRoles();
      if (!roles.length) {
        console.log(chalk.yellow('No hay roles definidos.'));
        return;
      }
      console.log(chalk.cyan(`Roles (${roles.length}):`));
      for (const r of roles) {
        console.log(
          `- ${chalk.bold(String(r.name))}  ${r.description ? `— ${r.description}` : ''}\n  perms: ${r.permissions.join(', ')}`
        );
      }
    } catch (err: any) {
      console.error(chalk.red(`❌ Error listando roles: ${err?.message || String(err)}`));
      process.exit(1);
    }
  });

export default cmd;
