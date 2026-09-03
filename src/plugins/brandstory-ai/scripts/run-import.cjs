#!/usr/bin/env node
/**
 * One-shot Brandstory import using current plugin source (no admin JWT).
 * Usage: node src/plugins/brandstory-ai/scripts/run-import.cjs [--clear-imported]
 */
const { createStrapi } = require('@strapi/strapi');

const clearImported = process.argv.includes('--clear-imported');

async function main() {
  const app = createStrapi({ distDir: './dist' });
  await app.load();

  try {
    const sync = app.plugin('brandstory-ai').service('sync');
    const settings = await app.plugin('brandstory-ai').service('settings').get();
    const key = sync.importedOptionKey(settings);

    if (clearImported) {
      const store = sync.importedStore();
      const raw = (await store.get({})) || {};
      console.log('[run-import] clearing imported ids for key:', key);
      console.log('[run-import] previous count:', (raw[key] || []).length);
      raw[key] = [];
      await store.set({ value: raw });
    }

    const preview = await sync.fetchPreview();
    if (preview.error) {
      console.error('[run-import] fetch error:', preview.error);
      process.exitCode = 1;
      return;
    }

    console.log('[run-import] queue counts:', preview.counts);
    console.log(
      '[run-import] posts:',
      (preview.posts || []).map((p) => `${p.sync_id} | ${p.title}`).join('\n') || '(none)'
    );

    if (!preview.posts?.length) {
      console.error(
        '[run-import] empty queue. Re-run with --clear-imported, or check Brandstory folder still has posts.'
      );
      process.exitCode = 1;
      return;
    }

    const result = await sync.runImport({ source: 'manual' });
    console.log('[run-import] result:', JSON.stringify(result, null, 2));
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await app.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
