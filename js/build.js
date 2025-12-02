
const path = require('path');
const fs = require('fs');
const { resolveStackDir, buildDirNameFromPath } = require('./stack_paths');
const { createLogger } = require('./logger');
const { loadStack } = require('./stack_loader');
const { loadTemplates, renderTemplate, resolveOutputPath } = require('./template_utils');

function mapToObject(mapLike) {
    if (mapLike instanceof Map) {
        const obj = {};
        mapLike.forEach((value, key) => {
            obj[key] = value;
        });
        return obj;
    }
    return mapLike || {};
}

function resolveDefaultsDir(defaultsDirInput) {
    const base = defaultsDirInput || path.join(__dirname, '..', 'defaults');
    const abs = path.isAbsolute(base) ? base : path.resolve(process.cwd(), base);
    if (!fs.existsSync(abs)) {
        return abs;
    }
    const real = fs.realpathSync(abs);
    const stat = fs.statSync(real);
    if (!stat.isDirectory()) {
        throw new Error(`Defaults path is not a directory: ${defaultsDirInput}`);
    }
    return real;
}

// --- Argument parsing -------------------------------------------------------
function parseArgs(argv) {
    let stackDirInput = null;
    let defaultsDirInput = null;
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '-d' || arg === '--defaults') {
            defaultsDirInput = argv[i + 1];
            i += 1;
            continue;
        }
        if (!stackDirInput) {
            stackDirInput = arg;
            continue;
        }
        console.error(`Unknown argument: ${arg}`);
        process.exit(1);
    }

    if (!stackDirInput) {
        console.error('Usage: node build.js [-d defaultsDir] <stack directory>');
        process.exit(1);
    }

    let stackDir;
    let defaultsDir;
    try {
        stackDir = resolveStackDir(stackDirInput);
        defaultsDir = resolveDefaultsDir(defaultsDirInput);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }

    return { stackDir, defaultsDir };
}

// --- Template writing -------------------------------------------------------
function writeTemplate(templateKey, filename, templates, buildDir, obj, stackById, log) {
    const templateContent = templates[templateKey];
    if (templateContent === undefined) {
        log.warn(`Template '${templateKey}' not found for ${filename}`);
        return;
    }

    const outPath = resolveOutputPath(templateKey, filename, buildDir, log);
    if (!outPath) {
        return;
    }

    const outputs = [];
    const rendered = renderTemplate(
        templateKey,
        templateContent,
        obj,
        stackById,
        log,
        { buildDir, outputs }
    );
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, rendered, 'utf8');
    outputs.forEach(extra => {
        fs.mkdirSync(path.dirname(extra.path), { recursive: true });
        fs.writeFileSync(extra.path, extra.content, 'utf8');
    });
}

// --- Build directory handling ----------------------------------------------
function cleanBuildDir(buildDir, buildRoot) {
    const buildDirRelative = path.relative(buildRoot, buildDir);
    if (buildDirRelative.startsWith('..') || path.isAbsolute(buildDirRelative)) {
        throw new Error(`Refusing to delete build directory outside build root: ${buildDir}`);
    }
    if (fs.existsSync(buildDir)) {
        fs.rmSync(buildDir, { recursive: true, force: true });
    }
}

// --- Main build process -----------------------------------------------------
function main() {
    const log = createLogger();
    const { stackDir, defaultsDir } = parseArgs(process.argv);
    const buildRoot = path.join(__dirname, '..', 'build');
    const buildDir = path.join(buildRoot, buildDirNameFromPath(stackDir));

    try {
        const templates = loadTemplates(stackDir, defaultsDir);
        const { stackObjects, stackById, resolvedClasses, globals } = loadStack(stackDir, defaultsDir, log);
        const stack = stackObjects;
        const canonical = {
            globals,
            classes: mapToObject(resolvedClasses),
            instances: stackObjects.filter(obj => obj && obj.id && !obj.id.startsWith('_')),
            reserved: Object.fromEntries(Array.from(stackById.entries()).filter(([id]) => typeof id === 'string' && id.startsWith('_'))),
            stackById: mapToObject(stackById)
        };

        console.log(`Building stack from ${stackDir} -> ${buildDir}`);
        cleanBuildDir(buildDir, buildRoot);
        fs.mkdirSync(buildDir, { recursive: true });
        fs.writeFileSync(path.join(buildDir, 'canonical.json'), JSON.stringify(canonical, null, 2));

        stack
            .filter(obj => Array.isArray(obj.build) && obj.build.length > 0)
            .forEach(obj => {
            console.log(`Processing ${obj.id}`);
            obj.build.forEach(buildItem => {
                if (typeof buildItem === 'string') {
                    const ext = path.extname(buildItem);
                    const filename = obj.id + ext;
                    writeTemplate(buildItem, filename, templates, buildDir, obj, stackById, log);
                    return;
                }
                if (typeof buildItem === 'object' && buildItem !== null) {
                    Object.entries(buildItem).forEach(([templateKey, filename]) => {
                        writeTemplate(templateKey, filename, templates, buildDir, obj, stackById, log);
                    });
                    return;
                }
                log.warn(`Skipping invalid build entry in ${obj.id}: ${JSON.stringify(buildItem)}`);
            });
        });
    } catch (e) {
        log.error(e.message);
    } finally {
        log.summarizeAndExitIfNeeded();
    }
}

main();
