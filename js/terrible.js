#!/usr/bin/env node

const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { runBuild, runClassesBuild, runInstancesBuild, runValidate } = require('./build');

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
          describe: 'Stack directories (shorthand for both --classes-from and --instances-from)',
          type: 'string'
        })
        .option('stack', {
          alias: 's',
          type: 'array',
          describe: 'Stack directory (repeatable, shorthand for both sources)'
        })
        .option('classes-from', {
          type: 'array',
          describe: 'Directories to source classes from (required if no --stack)'
        })
        .option('instances-from', {
          type: 'array',
          describe: 'Directories to source instances from (required if no --stack)'
        })
        .option('templates-from', {
          type: 'array',
          describe: 'Directories to source templates from (defaults to union of class/instance sources)'
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
        .option('output', {
          alias: 'o',
          type: 'array',
          describe: 'Output types: canonical, class-definitions, schemas, instances, validation, templates (repeatable or comma-separated)',
          default: ['canonical', 'class-definitions', 'schemas', 'validation', 'templates']
        })
  )
  .command(
    'classes [stacks..]',
    'Build classes/schemas only (no instances or templates)',
    (y) =>
      y
        .positional('stacks', {
          describe: 'Stack directories to source classes from',
          type: 'string'
        })
        .option('stack', {
          alias: 's',
          type: 'array',
          describe: 'Stack directory (repeatable)'
        })
        .option('classes-from', {
          type: 'array',
          describe: 'Directories to source classes from (alternative to --stack)'
        })
        .option('build-root', {
          type: 'string',
          describe: 'Build root directory (default is <repo>/build)'
        })
        .option('build-name', {
          type: 'string',
          describe: 'Build directory name under the build root'
        })
        .option('build-dir', {
          type: 'string',
          describe: 'Full build directory path (overrides build-root/name)'
        })
        .option('hash', {
          type: 'boolean',
          default: true,
          describe: 'Include hash suffix when auto-naming (use --no-hash to disable)'
        })
        .option('quiet', {
          type: 'boolean',
          default: false,
          describe: 'Suppress non-error output'
        })
        .option('output', {
          alias: 'o',
          type: 'array',
          describe: 'Output types: canonical, class-definitions, schemas (repeatable or comma-separated)',
          default: ['canonical', 'class-definitions', 'schemas']
        })
  )
  .command(
    'instances [stacks..]',
    'Merge instances only (no classes, no validation, no templates)',
    (y) =>
      y
        .positional('stacks', {
          describe: 'Stack directories to source instances from',
          type: 'string'
        })
        .option('stack', {
          alias: 's',
          type: 'array',
          describe: 'Stack directory (repeatable)'
        })
        .option('instances-from', {
          type: 'array',
          describe: 'Stack roots to source instances from (defaults to --stack order)'
        })
        .option('build-root', {
          type: 'string',
          describe: 'Build root directory (default is <repo>/build)'
        })
        .option('build-name', {
          type: 'string',
          describe: 'Build directory name under the build root'
        })
        .option('build-dir', {
          type: 'string',
          describe: 'Full build directory path (overrides build-root/name)'
        })
        .option('hash', {
          type: 'boolean',
          default: true,
          describe: 'Include hash suffix when auto-naming (use --no-hash to disable)'
        })
        .option('quiet', {
          type: 'boolean',
          default: false,
          describe: 'Suppress non-error output'
        })
        .option('output', {
          alias: 'o',
          type: 'array',
          describe: 'Output types: canonical, instances (repeatable or comma-separated)',
          default: ['canonical']
        })
  )
  .command(
    'validate [stacks..]',
    'Validate instances against classes without rendering',
    (y) =>
      y
        .positional('stacks', {
          describe: 'Stack directories (shorthand for both --classes-from and --instances-from)',
          type: 'string'
        })
        .option('stack', {
          alias: 's',
          type: 'array',
          describe: 'Stack directory (repeatable, shorthand for both sources)'
        })
        .option('classes-from', {
          type: 'array',
          describe: 'Directories to source classes from (required if no --stack)'
        })
        .option('instances-from', {
          type: 'array',
          describe: 'Directories to source instances from (required if no --stack)'
        })
        .option('warnings-as-errors', {
          type: 'boolean',
          default: false,
          describe: 'Treat validation warnings as errors'
        })
        .option('warn-extra-fields', {
          type: 'boolean',
          default: false,
          describe: 'Warn when instances carry fields not declared in schema'
        })
        .option('quiet', {
          type: 'boolean',
          default: false,
          describe: 'Suppress non-error output'
        })
        .option('output', {
          alias: 'o',
          type: 'array',
          describe: 'Output format: json (to stdout) or summary (human-readable)',
          default: ['summary']
        })
  )
  .command(
    'test',
    'Run regression tests',
    () => {},
    () => {
      const { spawnSync } = require('child_process');
      const result = spawnSync('node', ['tests/regression.test.js'], {
        stdio: 'inherit',
        cwd: repoRoot
      });
      process.exit(result.status || 0);
    }
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

// Parse --output into a Set (supports comma-separated and repeated flags)
function parseOutputs(outputArg) {
  if (!outputArg) return new Set();
  const outputs = Array.isArray(outputArg) ? outputArg : [outputArg];
  return new Set(outputs.flatMap(o => o.split(',')));
}

if (command === 'build') {
  const combinedStacks = []
    .concat(Array.isArray(argv.stack) ? argv.stack : [])
    .concat(Array.isArray(argv.stacks) ? argv.stacks : [])
    .filter(Boolean);

  const classDirs = argv['classes-from'] || (combinedStacks.length ? combinedStacks : null);
  const instanceDirs = argv['instances-from'] || (combinedStacks.length ? combinedStacks : null);

  if (!classDirs || !classDirs.length) {
    console.error('Error: --classes-from is required (or provide --stack for both sources)');
    process.exit(1);
  }
  if (!instanceDirs || !instanceDirs.length) {
    console.error('Error: --instances-from is required (or provide --stack for both sources)');
    process.exit(1);
  }

  runBuild({
    classDirs,
    instanceDirs,
    templateDirs: argv['templates-from'],
    outputs: parseOutputs(argv.output),
    buildRoot: argv['build-root'],
    buildDir: argv['build-dir'],
    buildName: argv['build-name'],
    includeHash: argv.hash !== false,
    warningsAsErrors: argv['warnings-as-errors'],
    warnExtraFields: argv['warn-extra-fields'],
    failOnCollisions: argv['fail-on-collisions'],
    quiet: argv.quiet
  });
} else if (command === 'classes') {
  const combinedStacks = []
    .concat(Array.isArray(argv.stack) ? argv.stack : [])
    .concat(Array.isArray(argv.stacks) ? argv.stacks : [])
    .filter(Boolean);

  const classDirs = argv['classes-from'] || (combinedStacks.length ? combinedStacks : null);

  if (!classDirs || !classDirs.length) {
    console.error('Error: --classes-from is required (or provide --stack)');
    process.exit(1);
  }

  runClassesBuild({
    classDirs,
    outputs: parseOutputs(argv.output),
    buildRoot: argv['build-root'],
    buildDir: argv['build-dir'],
    buildName: argv['build-name'],
    includeHash: argv.hash !== false,
    quiet: argv.quiet
  });
} else if (command === 'instances') {
  const combinedStacks = []
    .concat(Array.isArray(argv.stack) ? argv.stack : [])
    .concat(Array.isArray(argv.stacks) ? argv.stacks : [])
    .filter(Boolean);

  const instanceDirs = argv['instances-from'] || (combinedStacks.length ? combinedStacks : null);

  if (!instanceDirs || !instanceDirs.length) {
    console.error('Error: --instances-from is required (or provide --stack)');
    process.exit(1);
  }

  runInstancesBuild({
    instanceDirs,
    outputs: parseOutputs(argv.output),
    buildRoot: argv['build-root'],
    buildDir: argv['build-dir'],
    buildName: argv['build-name'],
    includeHash: argv.hash !== false,
    quiet: argv.quiet
  });
} else if (command === 'validate') {
  const combinedStacks = []
    .concat(Array.isArray(argv.stack) ? argv.stack : [])
    .concat(Array.isArray(argv.stacks) ? argv.stacks : [])
    .filter(Boolean);

  const classDirs = argv['classes-from'] || (combinedStacks.length ? combinedStacks : null);
  const instanceDirs = argv['instances-from'] || (combinedStacks.length ? combinedStacks : null);

  if (!classDirs || !classDirs.length) {
    console.error('Error: --classes-from is required (or provide --stack for both sources)');
    process.exit(1);
  }
  if (!instanceDirs || !instanceDirs.length) {
    console.error('Error: --instances-from is required (or provide --stack for both sources)');
    process.exit(1);
  }

  runValidate({
    classDirs,
    instanceDirs,
    outputs: parseOutputs(argv.output),
    warningsAsErrors: argv['warnings-as-errors'],
    warnExtraFields: argv['warn-extra-fields'],
    quiet: argv.quiet
  });
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
