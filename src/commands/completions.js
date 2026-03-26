import { logger } from '../lib/logger.js';
import { bashScript, zshScript, fishScript, installCompletions } from '../lib/completions.js';

export async function runCompletions(args) {
  const sub = args[0];

  switch (sub) {
    case 'bash':
      process.stdout.write(bashScript());
      break;
    case 'zsh':
      process.stdout.write(zshScript());
      break;
    case 'fish':
      process.stdout.write(fishScript());
      break;
    case 'install':
      installCompletions();
      break;
    default:
      logger.error(`Unknown shell: "${sub ?? ''}". Use: bash, zsh, fish, install`);
      process.exit(1);
  }
}
