'use strict';

const path = require('path');
const fs = require('fs');
const { loadTemplates, renderTemplate, resolveOutputPath } = require('./template_utils');
const { createLogger } = require('../logger');

function writeTemplate(templateKey, filename, templates, buildDir, obj, instancesById, log, seenOutputs, options = {}) {
  const { failOnCollisions = false, collisionState, canonical, services } = options;
  const collision = (message) => {
    if (failOnCollisions) {
      if (collisionState) collisionState.fatal = true;
      log.error(message);
    } else {
      log.warn(message);
    }
  };

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
    instancesById,
    log,
    { buildDir, outputs, canonical, services }
  );
  if (seenOutputs) {
    if (seenOutputs.has(outPath)) {
      collision(`Duplicate output path '${outPath}' from template '${templateKey}'`);
      if (failOnCollisions) {
        return;
      }
    }
    seenOutputs.add(outPath);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, rendered, 'utf8');
  outputs.forEach(extra => {
    if (seenOutputs) {
      if (seenOutputs.has(extra.path)) {
        collision(`Duplicate output path '${extra.path}' emitted from helper inside '${templateKey}'`);
        if (failOnCollisions) {
          return;
        }
      }
      seenOutputs.add(extra.path);
    }
    fs.mkdirSync(path.dirname(extra.path), { recursive: true });
    fs.writeFileSync(extra.path, extra.content, 'utf8');
  });
}

function createHandlebarsEngine({ stackDirs, log, quiet }) {
  const logger = log || createLogger({ quiet });
  let templates = {};
  let templateStats = null;

  function prepare() {
    const loaded = loadTemplates(stackDirs, logger);
    templates = loaded.templates;
    templateStats = loaded.stats;
    return { templates, templateStats };
  }

  function planOutputs(instances, buildDir, collisionLog) {
    const plannedPaths = new Map();
    instances
      .filter(obj => Array.isArray(obj.build) && obj.build.length > 0)
      .forEach(obj => {
        obj.build.forEach(buildItem => {
          if (typeof buildItem === 'string') {
            const ext = path.extname(buildItem);
            const filename = obj.id + ext;
            const outPath = resolveOutputPath(buildItem, filename, buildDir, logger);
            if (outPath) {
              const prev = plannedPaths.get(outPath);
              if (prev && prev[0] !== buildItem) {
                collisionLog(`Planned output collision at '${outPath}' between templates '${prev[0]}' (object '${prev[1]}') and '${buildItem}' (object '${obj.id}').`);
              }
              plannedPaths.set(outPath, [buildItem, obj.id]);
            }
            return;
          }
          if (typeof buildItem === 'object' && buildItem !== null) {
            Object.entries(buildItem).forEach(([templateKey, filename]) => {
              const outPath = resolveOutputPath(templateKey, filename, buildDir, logger);
              if (outPath) {
                const prev = plannedPaths.get(outPath);
                if (prev && (prev[0] !== templateKey || prev[1] !== obj.id)) {
                  collisionLog(`Planned output collision at '${outPath}' between templates '${prev[0]}' (object '${prev[1]}') and '${templateKey}' (object '${obj.id}').`);
                }
                plannedPaths.set(outPath, [templateKey, obj.id]);
              }
            });
            return;
          }
        });
      });
    return plannedPaths;
  }

  function renderAll({ snapshot, buildDir, failOnCollisions = false, canonical, services }) {
    const instances = snapshot.instances || [];
    const instancesById = snapshot.instancesById || {};
    const outputPaths = new Set();
    const collisionState = { fatal: false };
    const collisionLog = (message) => {
      if (failOnCollisions) {
        collisionState.fatal = true;
        logger.error(message);
      } else {
        logger.warn(message);
      }
    };

    planOutputs(instances, buildDir, collisionLog);
    if (collisionState.fatal) {
      logger.error('Output collisions detected during planning; aborting render (--fail-on-collisions).');
      return { renderedCount: 0, collisionFatal: true };
    }

    let renderedCount = 0;
    instances
      .filter(obj => Array.isArray(obj.build) && obj.build.length > 0)
      .forEach(obj => {
        logger.info(`  - process ${obj.id}`);
        obj.build.forEach(buildItem => {
          if (typeof buildItem === 'string') {
            const ext = path.extname(buildItem);
            const filename = obj.id + ext;
            writeTemplate(buildItem, filename, templates, buildDir, obj, instancesById, logger, outputPaths, { failOnCollisions, collisionState, canonical, services });
            renderedCount += 1;
            return;
          }
          if (typeof buildItem === 'object' && buildItem !== null) {
            Object.entries(buildItem).forEach(([templateKey, filename]) => {
              writeTemplate(templateKey, filename, templates, buildDir, obj, instancesById, logger, outputPaths, { failOnCollisions, collisionState, canonical, services });
              renderedCount += 1;
            });
            return;
          }
          logger.warn(`Skipping invalid build entry in ${obj.id}: ${JSON.stringify(buildItem)}`);
        });
      });

    if (collisionState.fatal) {
      logger.error('Output collisions detected; build aborted due to --fail-on-collisions.');
      return { renderedCount, collisionFatal: true };
    }

    return { renderedCount, collisionFatal: false };
  }

  return {
    prepare,
    renderAll,
    get templateStats() {
      return templateStats;
    }
  };
}

module.exports = {
  createHandlebarsEngine,
};
