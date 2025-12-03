#!/usr/bin/env node

const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { runBuild } = require('./build');

const repoRoot = path.join(__dirname, '..');
const defaultStack = path.join(repoRoot, 'stacks', 'recipes');
const defaultDefaults = path.join(repoRoot, 'defaults');

const argv = yargs(hideBin(process.argv))
  .scriptName('terrible')
  .usage('Usage: terrible <command> [options]')
  .command(
    'build [stack]',
    'Build a stack',
    (y) =>
      y
        .positional('stack', {
          describe: 'Path to stack directory (absolute or relative to cwd)',
          type: 'string',
          default: defaultStack
        })
        .option('defaults', {
          alias: 'd',
          type: 'string',
          describe: 'Path to defaults directory (absolute or relative to cwd)',
          default: defaultDefaults
        })
        .option('warnings-as-errors', {
          type: 'boolean',
          default: false,
          describe: 'Treat validation warnings as errors'
        })
        .option('warn-extra-fields', {
          type: 'boolean',
          default: false,
          describe: 'Warn when instances carry fields not declared in their class schema'
        })
        .option('fail-on-collisions', {
          type: 'boolean',
          default: false,
          describe: 'Treat duplicate output paths as fatal (pre-render and render-time)'
        })
        .option('quiet', {
          type: 'boolean',
          default: false,
          describe: 'Suppress non-error output (errors still printed)'
        })
  )
  .demandCommand(1, 'Please specify a command. For example: terrible build stacks/recipes')
  .help()
  .strict()
  .parse();

const command = argv._[0];

if (command === 'build') {
  runBuild({
    stackDir: argv.stack,
    defaultsDir: argv.defaults,
    warningsAsErrors: argv['warnings-as-errors'],
    warnExtraFields: argv['warn-extra-fields'],
    failOnCollisions: argv['fail-on-collisions'],
    quiet: argv.quiet
  });
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
