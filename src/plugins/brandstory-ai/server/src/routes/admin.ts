/**
 * Prefix under /admin so same-domain Next.js + nginx (which only
 * proxies /admin + /api) can reach these routes in production.
 * Default Strapi plugin prefix is /brandstory-ai (root) — that hits Next 404 HTML.
 */
export default {
  type: 'admin',
  prefix: '/admin/brandstory-ai',
  routes: [
    {
      method: 'GET',
      path: '/settings',
      handler: 'brandstory.getSettings',
      config: { policies: [] },
    },
    {
      method: 'PUT',
      path: '/settings',
      handler: 'brandstory.updateSettings',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/test-connection',
      handler: 'brandstory.testConnection',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/folders',
      handler: 'brandstory.loadFolders',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/fetch',
      handler: 'brandstory.fetchQueue',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/import',
      handler: 'brandstory.importQueue',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/clear-imported-ids',
      handler: 'brandstory.clearImportedIds',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/resync-folder',
      handler: 'brandstory.resyncFolder',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/synced-entries',
      handler: 'brandstory.listSyncedEntries',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/resync-by-sync-ids',
      handler: 'brandstory.resyncBySyncIds',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/delete-by-sync-ids',
      handler: 'brandstory.deleteBySyncIds',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/logs',
      handler: 'brandstory.listLogs',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/content-types',
      handler: 'brandstory.listContentTypes',
      config: { policies: [] },
    },
  ],
};
