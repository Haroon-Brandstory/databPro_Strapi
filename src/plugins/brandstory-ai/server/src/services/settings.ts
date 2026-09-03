import type { Core } from '@strapi/strapi';
import { repairPluginSettings } from './field-map-repair';
import {
  DEFAULT_DYNAMIC_ZONE,
  DEFAULT_SETTINGS,
  SYNC_ID_FIELD,
  type ContentWriteMode,
  type DynamicZoneMap,
  type FieldMap,
  type PluginSettings,
} from './types';

const STORE_KEY = 'settings';

function normalizeSettings(raw: Partial<PluginSettings> | null | undefined): PluginSettings {
  const merged: PluginSettings = {
    ...DEFAULT_SETTINGS,
    ...(raw || {}),
    fieldMap: {
      ...DEFAULT_SETTINGS.fieldMap,
      ...((raw?.fieldMap || {}) as Partial<FieldMap>),
    },
    dynamicZone: {
      ...DEFAULT_DYNAMIC_ZONE,
      ...((raw?.dynamicZone || {}) as Partial<DynamicZoneMap>),
    },
  };
  merged.siteUrl = (merged.siteUrl || '').trim().replace(/\/+$/, '');
  merged.workspace = (merged.workspace || '').replace(/[^a-zA-Z0-9._-]/g, '');
  merged.apiKey = (merged.apiKey || '').trim();
  merged.firebaseUid = (merged.firebaseUid || '').replace(/[^A-Za-z0-9_-]/g, '');
  merged.folderPair =
    merged.folderPair && merged.folderPair.includes('|') ? merged.folderPair.trim() : '';
  merged.contentTypeUid = (merged.contentTypeUid || DEFAULT_SETTINGS.contentTypeUid).trim();
  merged.contentMode =
    merged.contentMode === 'dynamiczone' ? 'dynamiczone' : ('field' as ContentWriteMode);
  merged.dynamicZone.field = (merged.dynamicZone.field || '').trim();
  merged.dynamicZone.component = (merged.dynamicZone.component || '').trim();
  merged.dynamicZone.htmlField = (merged.dynamicZone.htmlField || '').trim();
  merged.defaultPublishStatus =
    merged.defaultPublishStatus === 'draft' ? 'draft' : 'published';
  const chunk = Number(merged.importChunkSize);
  merged.importChunkSize = Number.isFinite(chunk) && chunk > 0 ? Math.min(50, Math.floor(chunk)) : 5;
  // Sync ID field is fixed — never use slug or a custom mapping.
  merged.fieldMap.syncId = SYNC_ID_FIELD;
  merged.fieldMap.slug = (merged.fieldMap.slug || '').trim();
  return merged;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  store() {
    return strapi.store({ type: 'plugin', name: 'brandstory-ai', key: STORE_KEY });
  },

  async get(): Promise<PluginSettings> {
    const raw = (await this.store().get({})) as Partial<PluginSettings> | null;
    return repairPluginSettings(strapi, normalizeSettings(raw));
  },

  async set(input: Partial<PluginSettings>): Promise<PluginSettings> {
    const current = await this.get();
    const next = repairPluginSettings(
      strapi,
      normalizeSettings({
        ...current,
        ...input,
        fieldMap: { ...current.fieldMap, ...(input.fieldMap || {}) },
        dynamicZone: { ...current.dynamicZone, ...(input.dynamicZone || {}) },
      })
    );
    await this.store().set({ value: next });
    return next;
  },

  insertApiUrl(settings?: PluginSettings): string {
    const s = settings || DEFAULT_SETTINGS;
    if (!s.siteUrl || !s.workspace) return '';
    return `${s.siteUrl}/api/${encodeURIComponent(s.workspace)}/blog/insert`;
  },

  listApiUrl(settings?: PluginSettings): string {
    const s = settings || DEFAULT_SETTINGS;
    if (!s.siteUrl || !s.workspace) return '';
    return `${s.siteUrl}/api/${encodeURIComponent(s.workspace)}/list`;
  },

  archiveApiUrl(settings?: PluginSettings): string {
    const s = settings || DEFAULT_SETTINGS;
    if (!s.siteUrl || !s.workspace) return '';
    return `${s.siteUrl}/api/${encodeURIComponent(s.workspace)}/blog/archive`;
  },
});
