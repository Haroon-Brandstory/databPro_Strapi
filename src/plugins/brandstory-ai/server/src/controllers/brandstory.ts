import type { Core } from '@strapi/strapi';
import { listComponents, listContentTypes } from '../services/schema';

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getSettings(ctx: any) {
    const settings = await strapi.plugin('brandstory-ai').service('settings').get();
    ctx.body = {
      ...settings,
      insertApiUrl: strapi.plugin('brandstory-ai').service('settings').insertApiUrl(settings),
    };
  },

  async updateSettings(ctx: any) {
    const body = ctx.request.body || {};
    const settings = await strapi.plugin('brandstory-ai').service('settings').set(body);
    ctx.body = {
      ...settings,
      insertApiUrl: strapi.plugin('brandstory-ai').service('settings').insertApiUrl(settings),
    };
  },

  async testConnection(ctx: any) {
    const result = await strapi.plugin('brandstory-ai').service('brandstoryClient').testConnection();
    await strapi.plugin('brandstory-ai').service('logger').write({
      source: 'test',
      status: result.ok ? 'success' : 'error',
      message: result.message,
    });
    ctx.body = result;
  },

  async loadFolders(ctx: any) {
    try {
      const pairs = await strapi
        .plugin('brandstory-ai')
        .service('brandstoryClient')
        .loadFolderPairs();
      ctx.body = { pairs };
    } catch (err) {
      ctx.status = 400;
      ctx.body = { error: err instanceof Error ? err.message : String(err) };
    }
  },

  async fetchQueue(ctx: any) {
    const preview = await strapi.plugin('brandstory-ai').service('sync').fetchPreview();
    if (preview.error) {
      ctx.status = 400;
      ctx.body = preview;
      return;
    }
    ctx.body = preview;
  },

  async importQueue(ctx: any) {
    const body = ctx.request.body || {};
    const result = await strapi.plugin('brandstory-ai').service('sync').runImport({
      source: 'manual',
      publishStatus: body.publishStatus,
      onlySyncIds: Array.isArray(body.onlySyncIds) ? body.onlySyncIds.map(String) : undefined,
    });
    ctx.body = result;
  },

  async clearImportedIds(ctx: any) {
    const body = ctx.request.body || {};
    const sync = strapi.plugin('brandstory-ai').service('sync');
    const settings = await strapi.plugin('brandstory-ai').service('settings').get();
    const onlyIds = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];

    if (onlyIds.length > 0) {
      const removed = await sync.removeImportedIds(settings, onlyIds);
      await strapi.plugin('brandstory-ai').service('logger').write({
        source: 'manual',
        status: 'success',
        message: `Removed ${removed} imported id(s) from tracking.`,
        meta: { removed, ids: onlyIds },
      });
      ctx.body = { cleared: removed, folderPair: settings.folderPair || '', ids: onlyIds };
      return;
    }

    const result = await sync.clearImportedIds(settings);
    await strapi.plugin('brandstory-ai').service('logger').write({
      source: 'manual',
      status: 'success',
      message: `Cleared ${result.cleared} imported id(s) for "${result.folderPair || 'folder'}".`,
      meta: { cleared: result.cleared, folderPair: result.folderPair },
    });
    ctx.body = result;
  },

  async resyncFolder(ctx: any) {
    const body = ctx.request.body || {};
    const result = await strapi.plugin('brandstory-ai').service('sync').resyncFolder({
      source: 'manual',
      publishStatus: body.publishStatus,
      onlySyncIds: Array.isArray(body.onlySyncIds) ? body.onlySyncIds.map(String) : undefined,
    });
    ctx.body = result;
  },

  async listSyncedEntries(ctx: any) {
    const limit = Number(ctx.query?.limit) || 100;
    const data = await strapi.plugin('brandstory-ai').service('sync').listSyncedEntries(limit);
    // Always return a stable shape for the admin UI.
    ctx.body = {
      entries: Array.isArray(data?.entries) ? data.entries : [],
      trackedImportedIds: Number(data?.trackedImportedIds) || 0,
      folderPair: typeof data?.folderPair === 'string' ? data.folderPair : '',
    };
  },

  async resyncBySyncIds(ctx: any) {
    const body = ctx.request.body || {};
    const syncIds = Array.isArray(body.syncIds) ? body.syncIds.map(String) : [];
    if (syncIds.length === 0) {
      ctx.status = 400;
      ctx.body = { error: 'syncIds required' };
      return;
    }
    const result = await strapi.plugin('brandstory-ai').service('sync').resyncBySyncIds(syncIds, {
      source: 'manual',
      publishStatus: body.publishStatus,
    });
    ctx.body = result;
  },

  async deleteBySyncIds(ctx: any) {
    const body = ctx.request.body || {};
    const syncIds = Array.isArray(body.syncIds) ? body.syncIds.map(String) : [];
    if (syncIds.length === 0) {
      ctx.status = 400;
      ctx.body = { error: 'syncIds required' };
      return;
    }
    const result = await strapi.plugin('brandstory-ai').service('sync').deleteBySyncIds(syncIds);
    await strapi.plugin('brandstory-ai').service('logger').write({
      source: 'manual',
      status: result.errors.length ? 'partial' : 'success',
      message: `Deleted ${result.deleted} entr${result.deleted === 1 ? 'y' : 'ies'} by sync id (${result.missing} missing).`,
      failed: result.errors.length,
      errors: result.errors,
      meta: { deleted: result.deleted, missing: result.missing },
    });
    ctx.body = result;
  },

  async listLogs(ctx: any) {
    const limit = Number(ctx.query?.limit) || 50;
    const logs = await strapi.plugin('brandstory-ai').service('logger').list(limit);
    ctx.body = { logs };
  },

  async listContentTypes(ctx: any) {
    ctx.body = {
      contentTypes: listContentTypes(strapi),
      components: listComponents(strapi),
    };
  },
});

export default controller;
