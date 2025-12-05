#!/usr/bin/env node

const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { runBuild, runClassesBuild, runInstancesBuild, runValidate } = require('./build');
const { asArray } = require('./core/object_utils');

const repoRoot = path.join(__dirname, '..');

// --- Shared option definitions ---
const sharedBuildOptions = {
  'build-root': { type: 'string', describe: 'Build root directory (default is <repo>/build)' },
  'build-name': { type: 'string', describe: 'Build directory name under the build root' },
  'build-dir': { type: 'string', describe: 'Full build directory path (overrides build-root/name)' },
  hash: { type: 'boolean', default: true, describe: 'Include hash suffix when auto-naming (use --no-hash to disable)' },
  quiet: { type: 'boolean', default: false, describe: 'Suppress non-error output' }
};

const stackOption = { alias: 's', type: 'array', describe: 'Stack directory (repeatable)' };
const classesFromOption = { type: 'array', describe: 'Directories to source classes from' };
const instancesFromOption = { type: 'array', describe: 'Directories to source instances from' };
const warningsAsErrorsOption = { type: 'boolean', default: false, describe: 'Treat validation warnings as errors' };
const warnExtraFieldsOption = { type: 'boolean', default: false, describe: 'Warn when instances carry undeclared fields' };

// --- Helpers ---
const parseOutputs = (outputArg) => {
  if (!outputArg) return new Set();
  return new Set(asArray(outputArg).flatMap(o => o.split(',')));
};

const getCombinedStacks = (argv) => [...asArray(argv.stack), ...asArray(argv.stacks)].filter(Boolean);

const requireDirs = (dirs, label, altHint) => {
  if (!dirs || !dirs.length) {
    console.error(`Error: ${label} is required${altHint ? ` (or provide ${altHint})` : ''}`);
    process.exit(1);
  }
  return dirs;
};

const parser = yargs(hideBin(process.argv))
  .scriptName('terrible')
  .usage('Usage: terrible <command> [options]')
  .command(
    'build [stacks..]',
    'Build one or more stacks',
    (y) =>
      y
        .positional('stacks', { describe: 'Stack directories (shorthand for both sources)', type: 'string' })
        .option('stack', { ...stackOption, describe: 'Stack directory (repeatable, shorthand for both sources)' })
        .option('classes-from', classesFromOption)
        .option('instances-from', instancesFromOption)
        .option('templates-from', { type: 'array', describe: 'Directories to source templates from (defaults to union of class/instance sources)' })
        .options(sharedBuildOptions)
        .option('warnings-as-errors', warningsAsErrorsOption)
        .option('warn-extra-fields', warnExtraFieldsOption)
        .option('fail-on-collisions', { type: 'boolean', default: false, describe: 'Treat duplicate output paths as fatal' })
        .option('output', { alias: 'o', type: 'array', default: ['canonical', 'class-definitions', 'schemas', 'validation', 'templates'], describe: 'Output types (comma-separated or repeatable)' })
  )
  .command(
    'classes [stacks..]',
    'Build classes/schemas only (no instances or templates)',
    (y) =>
      y
        .positional('stacks', { describe: 'Stack directories to source classes from', type: 'string' })
        .option('stack', stackOption)
        .option('classes-from', { ...classesFromOption, describe: 'Directories to source classes from (alternative to --stack)' })
        .options(sharedBuildOptions)
        .option('output', { alias: 'o', type: 'array', default: ['canonical', 'class-definitions', 'schemas'], describe: 'Output types: canonical, class-definitions, schemas' })
  )
  .command(
    'instances [stacks..]',
    'Merge instances only (no classes, no validation, no templates)',
    (y) =>
      y
        .positional('stacks', { describe: 'Stack directories to source instances from', type: 'string' })
        .option('stack', stackOption)
        .option('instances-from', { ...instancesFromOption, describe: 'Stack roots to source instances from (defaults to --stack order)' })
        .options(sharedBuildOptions)
        .option('output', { alias: 'o', type: 'array', default: ['canonical'], describe: 'Output types: canonical, instances' })
  )
  .command(
    'validate [stacks..]',
    'Validate instances against classes without rendering',
    (y) =>
      y
        .positional('stacks', { describe: 'Stack directories (shorthand for both sources)', type: 'string' })
        .option('stack', { ...stackOption, describe: 'Stack directory (repeatable, shorthand for both sources)' })
        .option('classes-from', classesFromOption)
        .option('instances-from', instancesFromOption)
        .option('warnings-as-errors', warningsAsErrorsOption)
        .option('warn-extra-fields', warnExtraFieldsOption)
        .option('quiet', { type: 'boolean', default: false, describe: 'Suppress non-error output' })
        .option('output', { alias: 'o', type: 'array', default: ['summary'], describe: 'Output format: json (to stdout) or summary' })
  )
  .command(
    'test',
    'Run regression tests',
    () => {},
    () => {
      const { spawnSync } = require('child_process');
      const result = spawnSync('node', ['tests/regression.test.js'], { stdio: 'inherit', cwd: repoRoot });
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

// --- Command handlers ---
if (command === 'build') {
  const stacks = getCombinedStacks(argv);
  const classDirs = requireDirs(argv['classes-from'] || (stacks.length ? stacks : null), '--classes-from', '--stack');
  const instanceDirs = requireDirs(argv['instances-from'] || (stacks.length ? stacks : null), '--instances-from', '--stack');

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
  const stacks = getCombinedStacks(argv);
  const classDirs = requireDirs(argv['classes-from'] || (stacks.length ? stacks : null), '--classes-from', '--stack');

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
  const stacks = getCombinedStacks(argv);
  const instanceDirs = requireDirs(argv['instances-from'] || (stacks.length ? stacks : null), '--instances-from', '--stack');

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
  const stacks = getCombinedStacks(argv);
  const classDirs = requireDirs(argv['classes-from'] || (stacks.length ? stacks : null), '--classes-from', '--stack');
  const instanceDirs = requireDirs(argv['instances-from'] || (stacks.length ? stacks : null), '--instances-from', '--stack');

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
