import chalk from 'chalk';

export const logger = {
  success(msg) { console.log(chalk.green('✔ ') + msg); },
  error(msg)   { console.error(chalk.red('✖ ') + msg); },
  warn(msg)    { console.warn(chalk.yellow('⚠ ') + msg); },
  info(msg)    { console.log(chalk.cyan('ℹ ') + msg); },
  dim(msg)     { console.log(chalk.dim(msg)); },
  plain(msg)   { console.log(msg); },

  // Print a key/value pair indented under a success/info block
  detail(key, value) {
    const k = chalk.dim(key.padEnd(10));
    console.log(`  ${k} ${value}`);
  },

  // Print a section header
  section(title) {
    console.log('\n' + chalk.bold.underline(title));
  },

  // Print a horizontal rule
  rule() {
    console.log(chalk.dim('─'.repeat(60)));
  },
};
