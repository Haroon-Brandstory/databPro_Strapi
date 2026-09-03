import type { Core } from '@strapi/strapi';
import type { BrandstoryPost, PluginSettings, PublishStatus, SyncResult } from './types';
import { SYNC_ID_FIELD } from './types';
import {
  prepareContentHtml,
  resolveApiId,
  resolveCoverS3Key,
  resolveFeaturedImageSrc,
  resolveSeoDescription,
  resolveSeoTitle,
  resolveSlug,
  resolveSyncId,
  resolveTitle,
} from './content';
import { formatBodyForAttributeType } from './html-to-blocks';

const IMPORTED_IDS_STORE = 'imported-ids';

type RunImportOptions = {
  source?: 'manual' | 'cron';
  publishStatus?: PublishStatus;
  /** If set, only import these sync ids from the current queue fetch. */
  onlySyncIds?: string[];
  posts?: BrandstoryPost[];
  files?: string[];
};

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  importedStore() {
    return strapi.store({ type: 'plugin', name: 'brandstory-ai', key: IMPORTED_IDS_STORE });
  },

  importedOptionKey(settings: PluginSettings): string {
    const api = strapi.plugin('brandstory-ai').service('settings').insertApiUrl(settings);
    return `${api}\x1e${settings.folderPair}\x1e${settings.firebaseUid}`;
  },

  async getImportedIds(settings: PluginSettings): Promise<string[]> {
    const raw = (await this.importedStore().get({})) as Record<string, string[]> | null;
    const key = this.importedOptionKey(settings);
    const list = raw?.[key];
    return Array.isArray(list) ? list.map(String) : [];
  },

  async addImportedIds(settings: PluginSettings, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const raw = ((await this.importedStore().get({})) as Record<string, string[]>) || {};
    const key = this.importedOptionKey(settings);
    const prev = Array.isArray(raw[key]) ? raw[key] : [];
    raw[key] = Array.from(new Set([...prev.map(String), ...ids.map(String)]));
    await this.importedStore().set({ value: raw });
  },

  /**
   * Clear tracked Brandstory API ids for the current folder settings only.
   * Does not delete Strapi blog entries or brandstorySyncId fields.
   */
  async clearImportedIds(
    settings?: PluginSettings
  ): Promise<{ cleared: number; key: string; folderPair: string }> {
    const cfg: PluginSettings =
      settings || (await strapi.plugin('brandstory-ai').service('settings').get());
    const store = this.importedStore();
    const raw = ((await store.get({})) as Record<string, string[]>) || {};
    const key = this.importedOptionKey(cfg);
    const prev = Array.isArray(raw[key]) ? raw[key] : [];
    const cleared = prev.length;
    raw[key] = [];
    await store.set({ value: raw });
    return { cleared, key, folderPair: cfg.folderPair || '' };
  },

  /**
   * Clear imported-ids for current folder, then fetch+upsert queue.
   * Existing Strapi entries matched by brandstorySyncId are updated in place.
   */
  async resyncFolder(options: RunImportOptions = {}): Promise<
    SyncResult & { clearedImportedIds: number; folderPair: string }
  > {
    const settings: PluginSettings = await strapi
      .plugin('brandstory-ai')
      .service('settings')
      .get();
    const { cleared, folderPair } = await this.clearImportedIds(settings);
    const result = await this.runImport({
      ...options,
      source: options.source || 'manual',
    });
    return {
      ...result,
      clearedImportedIds: cleared,
      folderPair,
      message:
        cleared > 0
          ? `Cleared ${cleared} imported id(s) for "${folderPair || 'folder'}". ${result.message}`
          : result.message,
    };
  },

  async removeImportedIds(settings: PluginSettings, ids: string[]): Promise<number> {
    const remove = new Set(ids.map(String).filter(Boolean));
    if (remove.size === 0) return 0;
    const store = this.importedStore();
    const raw = ((await store.get({})) as Record<string, string[]>) || {};
    const key = this.importedOptionKey(settings);
    const prev = Array.isArray(raw[key]) ? raw[key].map(String) : [];
    const next = prev.filter((id) => !remove.has(id));
    const removed = prev.length - next.length;
    raw[key] = next;
    await store.set({ value: raw });
    return removed;
  },

  /**
   * List Strapi entries that already have brandstorySyncId (for select/delete UI).
   * Merges draft + published by documentId.
   */
  async listSyncedEntries(limit = 100): Promise<{
    entries: Array<{ documentId: string; syncId: string; title: string; status: string }>;
    trackedImportedIds: number;
    folderPair: string;
  }> {
    const settings: PluginSettings = await strapi
      .plugin('brandstory-ai')
      .service('settings')
      .get();
    const tracked = await this.getImportedIds(settings);
    const empty = {
      entries: [] as Array<{ documentId: string; syncId: string; title: string; status: string }>,
      trackedImportedIds: tracked.length,
      folderPair: settings.folderPair || '',
    };

    const uid = settings.contentTypeUid;
    if (!uid || !strapi.contentTypes[uid]?.attributes?.[SYNC_ID_FIELD]) {
      return empty;
    }
    const titleField = settings.fieldMap?.title || 'blogTitle';
    const take = Math.min(200, Math.max(1, limit));
    const byDoc = new Map<
      string,
      { documentId: string; syncId: string; title: string; status: string }
    >();

    const ingest = (rows: unknown[], status: string) => {
      for (const row of rows || []) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const syncId = String(r[SYNC_ID_FIELD] || '').trim();
        const documentId = String(r.documentId || '').trim();
        if (!syncId || !documentId) continue;
        const prev = byDoc.get(documentId);
        // Prefer draft row when both exist.
        if (prev && prev.status === 'draft') continue;
        byDoc.set(documentId, {
          documentId,
          syncId,
          title: String(r[titleField] || syncId),
          status: prev?.status === 'draft' ? 'draft' : status,
        });
      }
    };

    const loadStatus = async (status: 'draft' | 'published') => {
      try {
        return await strapi.documents(uid).findMany({
          filters: { [SYNC_ID_FIELD]: { $notNull: true } },
          fields: ['documentId', SYNC_ID_FIELD, titleField],
          status,
          limit: take,
        });
      } catch {
        try {
          return await strapi.documents(uid).findMany({
            fields: ['documentId', SYNC_ID_FIELD, titleField],
            status,
            limit: take,
          });
        } catch (err) {
          strapi.log.warn(
            `[brandstory-ai] listSyncedEntries(${status}) failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          return [];
        }
      }
    };

    ingest(await loadStatus('published'), 'published');
    ingest(await loadStatus('draft'), 'draft');

    const entries = Array.from(byDoc.values()).sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    );

    return {
      entries,
      trackedImportedIds: tracked.length,
      folderPair: settings.folderPair || '',
    };
  },

  /**
   * Forget selected ids in tracking, fetch Brandstory, upsert only those sync ids.
   */
  async resyncBySyncIds(
    syncIds: string[],
    options: RunImportOptions = {}
  ): Promise<
    SyncResult & {
      clearedImportedIds: number;
      missingSyncIds: string[];
      folderPair: string;
    }
  > {
    const settings: PluginSettings = await strapi
      .plugin('brandstory-ai')
      .service('settings')
      .get();
    const ids = Array.from(
      new Set((syncIds || []).map(String).map((s) => s.trim()).filter(Boolean))
    );

    if (ids.length === 0) {
      return {
        inserted: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: ['No sync ids provided.'],
        message: 'No sync ids provided.',
        entries: [],
        archiveS3Keys: [],
        clearedImportedIds: 0,
        missingSyncIds: [],
        folderPair: settings.folderPair || '',
      };
    }

    const clearedImportedIds = await this.removeImportedIds(settings, ids);
    const importedIds = await this.getImportedIds(settings);
    const fetched = await strapi
      .plugin('brandstory-ai')
      .service('brandstoryClient')
      .fetchFullQueue(importedIds);

    if (fetched.error) {
      return {
        inserted: 0,
        updated: 0,
        skipped: 0,
        failed: ids.length,
        errors: [fetched.error],
        message: fetched.error,
        entries: [],
        archiveS3Keys: [],
        clearedImportedIds,
        missingSyncIds: ids,
        folderPair: settings.folderPair || '',
      };
    }

    const allow = new Set(ids);
    const posts = (fetched.posts || []).filter((p) => allow.has(resolveSyncId(p)));
    const found = new Set(posts.map((p) => resolveSyncId(p)));
    const missingSyncIds = ids.filter((id) => !found.has(id));

    const result = await this.runImport({
      ...options,
      source: options.source || 'manual',
      posts,
      files: fetched.files,
      onlySyncIds: ids,
    });

    const missingNote =
      missingSyncIds.length > 0
        ? ` ${missingSyncIds.length} selected id(s) not returned by Brandstory.`
        : '';

    return {
      ...result,
      clearedImportedIds,
      missingSyncIds,
      folderPair: settings.folderPair || '',
      message: `${result.message}${missingNote}`,
      errors: [
        ...result.errors,
        ...missingSyncIds.map((id) => `${id}: not in Brandstory queue after clearing tracking`),
      ],
    };
  },

  /**
   * Delete Strapi entries matched by brandstorySyncId. Also drops matching API ids
   * from the imported-ids store so they can be re-fetched.
   */
  async deleteBySyncIds(syncIds: string[]): Promise<{
    deleted: number;
    missing: number;
    removedImportedIds: number;
    errors: string[];
    entries: Array<{ syncId: string; documentId?: string; action: 'deleted' | 'missing' | 'error' }>;
  }> {
    const settings: PluginSettings = await strapi
      .plugin('brandstory-ai')
      .service('settings')
      .get();
    const uid = settings.contentTypeUid;
    const ids = Array.from(new Set((syncIds || []).map(String).map((s) => s.trim()).filter(Boolean)));
    const result = {
      deleted: 0,
      missing: 0,
      removedImportedIds: 0,
      errors: [] as string[],
      entries: [] as Array<{
        syncId: string;
        documentId?: string;
        action: 'deleted' | 'missing' | 'error';
      }>,
    };

    if (!uid) {
      result.errors.push('contentTypeUid is not configured.');
      return result;
    }
    if (!strapi.contentTypes[uid]?.attributes?.[SYNC_ID_FIELD]) {
      result.errors.push(`Missing field ${SYNC_ID_FIELD} on ${uid}.`);
      return result;
    }

    const apiIdsToForget: string[] = [];

    for (const syncId of ids) {
      try {
        const existing = await this.findExistingBySyncId(uid, SYNC_ID_FIELD, syncId);
        if (!existing) {
          result.missing += 1;
          result.entries.push({ syncId, action: 'missing' });
          // Still forget tracking so Brandstory can return it.
          apiIdsToForget.push(syncId);
          continue;
        }
        await strapi.documents(uid).delete({ documentId: existing.documentId });
        result.deleted += 1;
        result.entries.push({
          syncId,
          documentId: existing.documentId,
          action: 'deleted',
        });
        apiIdsToForget.push(syncId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${syncId}: ${msg}`);
        result.entries.push({ syncId, action: 'error' });
      }
    }

    // Also forget plain API ids if they differ from sync_id (queue uses both).
    result.removedImportedIds = await this.removeImportedIds(settings, apiIdsToForget);

    return result;
  },

  async findExistingBySyncId(
    contentTypeUid: string,
    syncField: string,
    syncId: string
  ): Promise<{ documentId: string } | null> {
    try {
      const rows = await strapi.documents(contentTypeUid).findMany({
        filters: { [syncField]: { $eq: syncId } },
        status: 'draft',
        limit: 1,
      });
      if (rows?.[0]?.documentId) {
        return { documentId: String(rows[0].documentId) };
      }
      const published = await strapi.documents(contentTypeUid).findMany({
        filters: { [syncField]: { $eq: syncId } },
        status: 'published',
        limit: 1,
      });
      if (published?.[0]?.documentId) {
        return { documentId: String(published[0].documentId) };
      }
    } catch (err) {
      strapi.log.warn(
        `[brandstory-ai] findExistingBySyncId failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return null;
  },

  async buildEntryData(
    item: BrandstoryPost,
    settings: PluginSettings,
    existingEntry?: Record<string, unknown> | null
  ): Promise<Record<string, unknown>> {
    const fm = settings.fieldMap;
    const title = resolveTitle(item);
    const prepared = prepareContentHtml(item);
    const { html: content, mediaBySrc } = await strapi
      .plugin('brandstory-ai')
      .service('media')
      .resolveInlineImagesForBlocks(prepared, title);

    const syncId = resolveSyncId(item);
    const seoTitle = resolveSeoTitle(item, title);
    const seoDescription = resolveSeoDescription(item, content);
    const excerpt =
      typeof item.excerpt === 'string'
        ? item.excerpt.replace(/^\d+\.\s*/gm, '').trim()
        : seoDescription;

    const ctAttrs = (strapi.contentTypes[settings.contentTypeUid]?.attributes ||
      {}) as Record<string, { type?: string }>;
    const writeIfMapped = (field: string | undefined, value: unknown) => {
      if (!field || value === undefined || value === null) return;
      if (!ctAttrs[field]) {
        strapi.log.warn(`[brandstory-ai] skip unknown mapped field "${field}"`);
        return;
      }
      data[field] = value;
    };

    const data: Record<string, unknown> = {};
    writeIfMapped(fm.title, title);
    writeIfMapped(fm.slug, resolveSlug(item, title));

    const mode = settings.contentMode === 'dynamiczone' ? 'dynamiczone' : 'field';
    const dz = settings.dynamicZone;
    if (mode === 'dynamiczone' && dz?.field && dz.component && dz.htmlField) {
      if (!ctAttrs[dz.field] || ctAttrs[dz.field].type !== 'dynamiczone') {
        throw new Error(`Dynamic zone field "${dz.field}" missing on ${settings.contentTypeUid}`);
      }
      const bodyValue = this.formatMappedBody(dz.component, dz.htmlField, content, mediaBySrc);
      data[dz.field] = this.mergeDynamicZoneContent(
        existingEntry?.[dz.field],
        dz.component,
        dz.htmlField,
        bodyValue
      );
    } else if (fm.content) {
      const flatType = ctAttrs[fm.content]?.type;
      writeIfMapped(
        fm.content,
        formatBodyForAttributeType(content, flatType, { mediaBySrc })
      );
    }

    writeIfMapped(fm.excerpt, excerpt);
    if (syncId) writeIfMapped(SYNC_ID_FIELD, syncId);
    writeIfMapped(fm.seoTitle, seoTitle);
    writeIfMapped(fm.seoDescription, seoDescription);

    const publishedAt =
      typeof item.published_at === 'string' && item.published_at.trim()
        ? item.published_at.trim()
        : '';
    if (fm.publishedAt && publishedAt && ctAttrs[fm.publishedAt]) {
      // Date-only attributes need YYYY-MM-DD
      const attrType = ctAttrs[fm.publishedAt]?.type;
      data[fm.publishedAt] =
        attrType === 'date' && publishedAt.length >= 10 ? publishedAt.slice(0, 10) : publishedAt;
    }

    const coverS3Key = resolveCoverS3Key(item);
    if (coverS3Key) writeIfMapped(fm.coverS3Key, coverS3Key);

    const coverSrc = resolveFeaturedImageSrc(item);
    if (fm.featuredImage && ctAttrs[fm.featuredImage] && coverSrc) {
      const file = await strapi
        .plugin('brandstory-ai')
        .service('media')
        .uploadCover(coverSrc, coverS3Key, title);
      if (file) {
        data[fm.featuredImage] = file.id;
      }
    }

    return data;
  },

  /**
   * Convert body HTML to the target component attribute type (blocks vs richtext/text).
   */
  formatMappedBody(
    componentUid: string,
    htmlField: string,
    html: string,
    mediaBySrc?: Record<string, Record<string, unknown>>
  ): unknown {
    const compAttrs = (strapi.components[componentUid]?.attributes || {}) as Record<
      string,
      { type?: string }
    >;
    const attrType = compAttrs[htmlField]?.type;
    return formatBodyForAttributeType(html, attrType, { mediaBySrc });
  },

  /**
   * Upsert body into the mapped DZ component without wiping sibling blocks
   * (e.g. keep blogImage components next to BlogContent).
   */
  mergeDynamicZoneContent(
    existingZone: unknown,
    componentUid: string,
    htmlField: string,
    bodyValue: unknown
  ): Array<Record<string, unknown>> {
    const block = {
      __component: componentUid,
      [htmlField]: bodyValue,
    };
    if (!Array.isArray(existingZone) || existingZone.length === 0) {
      return [block];
    }

    let updated = false;
    const next = existingZone.map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return row as Record<string, unknown>;
      const r = row as Record<string, unknown>;
      if (!updated && r.__component === componentUid) {
        updated = true;
        return {
          ...r,
          [htmlField]: bodyValue,
        };
      }
      return r;
    }) as Array<Record<string, unknown>>;

    if (!updated) {
      next.unshift(block);
    }
    return next;
  },

  async loadExistingForMerge(
    uid: string,
    documentId: string,
    dzField: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const doc = await strapi.documents(uid).findOne({
        documentId,
        populate: { [dzField]: true },
        status: 'draft',
      });
      if (doc) return doc as Record<string, unknown>;
      const published = await strapi.documents(uid).findOne({
        documentId,
        populate: { [dzField]: true },
        status: 'published',
      });
      return (published as Record<string, unknown>) || null;
    } catch (err) {
      strapi.log.warn(
        `[brandstory-ai] loadExistingForMerge failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  },

  async upsertPost(
    item: BrandstoryPost,
    settings: PluginSettings,
    publishStatus: PublishStatus
  ): Promise<{ action: 'inserted' | 'updated'; documentId: string; syncId: string; title: string }> {
    const uid = settings.contentTypeUid;
    const syncId = resolveSyncId(item);
    const title = resolveTitle(item);
    if (!syncId) {
      throw new Error(`Missing sync id for "${title}"`);
    }

    const ctAttrs = strapi.contentTypes[uid]?.attributes || {};
    if (!ctAttrs[SYNC_ID_FIELD]) {
      throw new Error(
        `Add unique string field "${SYNC_ID_FIELD}" on ${uid} before importing. Sync ID mapping is fixed.`
      );
    }
    if (settings.contentMode === 'dynamiczone') {
      const dz = settings.dynamicZone;
      if (!dz?.field || !dz.component || !dz.htmlField) {
        throw new Error('Dynamic zone mapping incomplete (zone + component + HTML field).');
      }
    } else if (!settings.fieldMap.content) {
      throw new Error('Map a Content field, or switch to Dynamic zone mode.');
    }

    const existing = await this.findExistingBySyncId(uid, SYNC_ID_FIELD, syncId);
    const status = publishStatus === 'draft' ? 'draft' : 'published';

    let existingEntry: Record<string, unknown> | null = null;
    if (
      existing &&
      settings.contentMode === 'dynamiczone' &&
      settings.dynamicZone?.field
    ) {
      existingEntry = await this.loadExistingForMerge(
        uid,
        existing.documentId,
        settings.dynamicZone.field
      );
    }

    const data = await this.buildEntryData(item, settings, existingEntry);

    try {
      if (existing) {
        const updated = await strapi.documents(uid).update({
          documentId: existing.documentId,
          data,
          status,
        });
        return {
          action: 'updated',
          documentId: String(updated.documentId || existing.documentId),
          syncId,
          title,
        };
      }

      const created = await strapi.documents(uid).create({
        data,
        status,
      });
      return {
        action: 'inserted',
        documentId: String(created.documentId),
        syncId,
        title,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const extra =
        err && typeof err === 'object' && 'details' in err
          ? JSON.stringify((err as { details?: unknown }).details)
          : '';
      strapi.log.error(
        `[brandstory-ai] upsert failed for "${title}" (${syncId}): ${detail}${extra ? ` ${extra}` : ''}`
      );
      throw new Error(extra ? `${detail} ${extra}` : detail);
    }
  },

  async runImport(options: RunImportOptions = {}): Promise<SyncResult> {
    const started = Date.now();
    const source = options.source || 'manual';
    const settings: PluginSettings = await strapi.plugin('brandstory-ai').service('settings').get();
    const publishStatus: PublishStatus =
      options.publishStatus || settings.defaultPublishStatus || 'published';

    if (!settings.siteUrl || !settings.workspace) {
      const result: SyncResult = {
        inserted: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: ['Plugin is not configured.'],
        message: 'Plugin is not configured.',
        entries: [],
        archiveS3Keys: [],
      };
      await strapi.plugin('brandstory-ai').service('logger').write({
        source,
        status: 'error',
        message: result.message,
        durationMs: Date.now() - started,
        errors: result.errors,
      });
      return result;
    }

    if (!settings.contentTypeUid) {
      const result: SyncResult = {
        inserted: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: ['contentTypeUid is not configured.'],
        message: 'contentTypeUid is not configured.',
        entries: [],
        archiveS3Keys: [],
      };
      await strapi.plugin('brandstory-ai').service('logger').write({
        source,
        status: 'error',
        message: result.message,
        durationMs: Date.now() - started,
        errors: result.errors,
      });
      return result;
    }

    let posts = options.posts;
    let files = options.files || [];
    if (!posts) {
      const importedIds = await this.getImportedIds(settings);
      const fetched = await strapi
        .plugin('brandstory-ai')
        .service('brandstoryClient')
        .fetchFullQueue(importedIds);
      if (fetched.error) {
        const result: SyncResult = {
          inserted: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          errors: [fetched.error],
          message: fetched.error,
          entries: [],
          archiveS3Keys: [],
        };
        await strapi.plugin('brandstory-ai').service('logger').write({
          source,
          status: 'error',
          message: result.message,
          durationMs: Date.now() - started,
          errors: result.errors,
        });
        return result;
      }
      posts = fetched.posts;
      files = fetched.files;
    }

    let work = posts.filter((p) => resolveSyncId(p));
    if (options.onlySyncIds?.length) {
      const allow = new Set(options.onlySyncIds.map(String));
      work = work.filter((p) => allow.has(resolveSyncId(p)));
    }

    const importedIds = await this.getImportedIds(settings);
    const importedSet = new Set(importedIds);
    // Upsert every queued item by sync_id (create or update).
    const queue = work;
    const result: SyncResult = {
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      message: '',
      entries: [],
      archiveS3Keys: [],
    };

    const newlyImported: string[] = [];
    const archiveKeys: string[] = [];

    for (const item of queue) {
      const apiId = resolveApiId(item) || resolveSyncId(item);
      const isNewExport = Boolean(apiId && !importedSet.has(apiId));
      try {
        const upserted = await this.upsertPost(item, settings, publishStatus);
        if (upserted.action === 'inserted') {
          result.inserted += 1;
        } else {
          result.updated += 1;
        }
        result.entries.push({
          documentId: upserted.documentId,
          title: upserted.title,
          syncId: upserted.syncId,
          action: upserted.action,
        });
        if (isNewExport && apiId) {
          newlyImported.push(apiId);
          importedSet.add(apiId);
        }
        const s3 =
          typeof item.s3_content_key === 'string' ? item.s3_content_key.trim() : '';
        if (isNewExport && s3) archiveKeys.push(s3);
      } catch (err) {
        result.failed += 1;
        result.errors.push(
          `${resolveTitle(item)}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (newlyImported.length > 0) {
      await this.addImportedIds(settings, newlyImported);
    }

    let keysForArchive = [...archiveKeys];
    if (result.inserted > 0 && keysForArchive.length === 0) {
      keysForArchive = files.filter((f) => typeof f === 'string' && f.trim());
    }
    if (result.inserted > 0 && keysForArchive.length > 0) {
      await strapi.plugin('brandstory-ai').service('brandstoryClient').requestArchive(keysForArchive);
    }
    result.archiveS3Keys = keysForArchive;

    if (queue.length === 0) {
      result.message = 'No posts in queue.';
    } else if (result.inserted > 0 && result.updated > 0) {
      result.message = `Inserted ${result.inserted}, updated ${result.updated}.`;
    } else if (result.updated > 0) {
      result.message = `Updated ${result.updated} entr${result.updated === 1 ? 'y' : 'ies'}.`;
    } else if (result.inserted > 0) {
      result.message = `Inserted ${result.inserted} entr${result.inserted === 1 ? 'y' : 'ies'}.`;
    } else if (result.failed > 0) {
      result.message = `Failed to import ${result.failed} entr${result.failed === 1 ? 'y' : 'ies'}.`;
    } else {
      result.message = 'Nothing to import.';
    }

    result.skipped = Math.max(0, work.length - result.inserted - result.updated - result.failed);

    const status =
      result.failed > 0 && (result.inserted > 0 || result.updated > 0)
        ? 'partial'
        : result.failed > 0
          ? 'error'
          : 'success';

    await strapi.plugin('brandstory-ai').service('logger').write({
      source,
      status,
      message: result.message,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      durationMs: Date.now() - started,
      errors: result.errors,
      meta: { contentTypeUid: settings.contentTypeUid, publishStatus },
    });

    return result;
  },

  async fetchPreview() {
    const settings = await strapi.plugin('brandstory-ai').service('settings').get();
    const importedIds = await this.getImportedIds(settings);
    const fetched = await strapi
      .plugin('brandstory-ai')
      .service('brandstoryClient')
      .fetchFullQueue(importedIds);

    if (fetched.error) {
      return { error: fetched.error, posts: [], files: [], meta: {}, counts: null };
    }

    const posts = fetched.posts;
    let newCount = 0;
    let updateCount = 0;
    for (const p of posts) {
      const syncId = resolveSyncId(p);
      const apiId = resolveApiId(p) || syncId;
      if (!syncId) continue;
      const existing = await this.findExistingBySyncId(
        settings.contentTypeUid,
        SYNC_ID_FIELD,
        syncId
      );
      if (existing) updateCount += 1;
      else if (apiId && !importedIds.includes(apiId)) newCount += 1;
      else newCount += 1;
    }

    const previewPosts = [];
    for (const p of posts) {
      const syncId = resolveSyncId(p);
      const existing = syncId
        ? await this.findExistingBySyncId(settings.contentTypeUid, SYNC_ID_FIELD, syncId)
        : null;
      previewPosts.push({
        id: resolveApiId(p),
        sync_id: syncId,
        title: resolveTitle(p),
        has_content: Boolean(prepareContentHtml(p)),
        existsInStrapi: Boolean(existing),
        documentId: existing?.documentId || '',
      });
    }

    return {
      error: null,
      posts: previewPosts,
      files: fetched.files,
      meta: fetched.meta,
      counts: { total: posts.length, new: newCount, update: updateCount },
    };
  },
});
