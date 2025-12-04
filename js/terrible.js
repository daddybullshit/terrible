#!/usr/bin/env node

const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { runBuild } = require('./build');

const repoRoot = path.join(__dirname, '..');

const parser = yargs(hideBin(process.argv))
  .scriptName('terrible')
  .usage('Usage: terrible <command> [options]')
  .command(
    'build [stacks..]',
    'Build one or more stacks',
    (y) =>
      y
        .positional('stacks', {
          describe: 'Stack directories (absolute or relative to cwd)',
          type: 'string'
        })
        .option('stack', {
          alias: 's',
          type: 'array',
          describe: 'Stack directory (repeatable, absolute or relative to cwd)'
        })
        .option('classes-from', {
          type: 'array',
          describe: 'Optional list of stack roots to source classes from (defaults to --stack order)'
        })
        .option('instances-from', {
          type: 'array',
          describe: 'Optional list of stack roots to source instances/global from (defaults to --stack order)'
        })
        .option('build-root', {
          type: 'string',
          describe: 'Build root directory (absolute or relative to cwd; default is <repo>/build)'
        })
        .option('build-name', {
          type: 'string',
          describe: 'Build directory name under the build root (use with/without --no-hash)'
        })
        .option('build-dir', {
          type: 'string',
          describe: 'Full build directory path (overrides build-root/name)'
        })
        .option('hash', {
          type: 'boolean',
          default: true,
          describe: 'Include hash suffix when auto-naming the build directory (use --no-hash to disable)'
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
  .help()
  .strict()
  .showHelpOnFail(false);

const argv = parser.parse();

if (argv._.length === 0) {
  parser.showHelp('log');
  process.exit(1);
}

const command = argv._[0];

if (command === 'build') {
  const combinedStacks = []
    .concat(Array.isArray(argv.stack) ? argv.stack : [])
    .concat(Array.isArray(argv.stacks) ? argv.stacks : [])
    .filter(Boolean);

  if (combinedStacks.length === 0) {
    parser.showHelp('log');
    process.exit(1);
  }
  runBuild({
    stackDirs: combinedStacks,
    classDirs: argv['classes-from'],
    instanceDirs: argv['instances-from'],
    buildRoot: argv['build-root'],
    buildDir: argv['build-dir'],
    buildName: argv['build-name'],
    includeHash: argv.hash !== false,
    warningsAsErrors: argv['warnings-as-errors'],
    warnExtraFields: argv['warn-extra-fields'],
    failOnCollisions: argv['fail-on-collisions'],
    quiet: argv.quiet
  });
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
