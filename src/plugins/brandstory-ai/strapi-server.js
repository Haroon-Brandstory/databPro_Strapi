'use strict';

/**
 * Strapi only loads .js plugin server entrypoints (loadConfigFile ignores .ts).
 * Register a TS loader, then load the TypeScript server source.
 */
function registerTs() {
  try {
    require('esbuild-register/dist/node').register({
      extensions: ['.ts', '.tsx'],
      hookIgnoreNodeModules: false,
    });
    return;
  } catch (_) {
    // continue
  }
  try {
    require('@swc-node/register');
    return;
  } catch (_) {
    // continue
  }
  try {
    require('ts-node/register/transpile-only');
  } catch (_) {
    // last resort — may fail if no loader
  }
}

registerTs();

module.exports = require('./server/src/index.ts');
