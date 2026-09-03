import type { Core } from '@strapi/strapi';
import type { BrandstoryPost, PluginSettings } from './types';
import { mergePostsBySyncId } from './content';

type FetchResult = {
  posts: BrandstoryPost[];
  files: string[];
  meta: Record<string, unknown>;
  error?: string;
};

const LIST_LIMIT = 15;
const TEST_TIMEOUT_MS = 60000;
const LIST_TIMEOUT_MS = 60000;
const QUEUE_TIMEOUT_MS = 180000;
const DETAIL_TIMEOUT_MS = 120000;
const ARCHIVE_TIMEOUT_MS = 60000;

function authHeaders(settings: PluginSettings): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
    headers['X-API-Key'] = settings.apiKey;
  }
  return headers;
}

function formatFetchError(err: unknown, label: string, timeoutMs: number): string {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  if (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    /signal is aborted|aborted without reason|The operation was aborted/i.test(msg)
  ) {
    return `${label} timed out after ${Math.round(timeoutMs / 1000)}s. Brandstory API slow or unreachable — retry, or check site URL / network.`;
  }
  return msg;
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON from Brandstory (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

function rowContentId(row: unknown): string {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return '';
  const o = row as Record<string, unknown>;
  for (const key of ['contentId', 'content_id', 'id'] as const) {
    const v = o[key];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getSettings(): Promise<PluginSettings> {
    return strapi.plugin('brandstory-ai').service('settings').get();
  },

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const settings = await this.getSettings();
    const insertUrl = strapi.plugin('brandstory-ai').service('settings').insertApiUrl(settings);
    if (!insertUrl) {
      return { ok: false, message: 'Configure App site URL and Workspace first.' };
    }

    const url = new URL(insertUrl);
    url.searchParams.set('limit', '1');
    if (settings.firebaseUid && settings.folderPair) {
      url.searchParams.set('firebaseUid', settings.firebaseUid);
      url.searchParams.set('folder', settings.folderPair);
    }

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: authHeaders(settings),
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        return { ok: false, message: `Insert API returned HTTP ${res.status}` };
      }
      const data = await parseJson(res);
      if (data.success) {
        return { ok: true, message: 'Connected' };
      }
      return { ok: false, message: 'Invalid API response' };
    } catch (err) {
      const msg = formatFetchError(err, 'Connection test', TEST_TIMEOUT_MS);
      return { ok: false, message: this.augmentLoopbackHint(msg, settings.siteUrl) };
    }
  },

  augmentLoopbackHint(message: string, siteUrl: string): string {
    const host = (() => {
      try {
        return new URL(siteUrl).hostname.toLowerCase();
      } catch {
        return '';
      }
    })();
    const isLoopback = host === 'localhost' || host === '127.0.0.1';
    const connFailed =
      /fetch failed|ECONNREFUSED|ENOTFOUND|couldn't connect|failed to connect|timed out/i.test(
        message
      );
    if (isLoopback && connFailed) {
      return `${message} Strapi calls this URL from the server process — localhost is the Strapi host, not your laptop. Use a LAN IP, tunnel, or production origin.`;
    }
    return message;
  },

  async loadFolderPairs(): Promise<string[]> {
    const settings = await this.getSettings();
    const listUrl = strapi.plugin('brandstory-ai').service('settings').listApiUrl(settings);
    if (!listUrl || !settings.firebaseUid) {
      throw new Error('Set App site URL, Workspace, and Firebase UID first.');
    }
    const url = new URL(listUrl);
    url.searchParams.set('firebaseUid', settings.firebaseUid);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: 'GET',
        headers: authHeaders(settings),
        signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(
        this.augmentLoopbackHint(
          formatFetchError(err, 'Folder list', LIST_TIMEOUT_MS),
          settings.siteUrl
        )
      );
    }
    if (!res.ok) {
      throw new Error(`List API returned HTTP ${res.status}`);
    }
    const data = await parseJson(res);
    if (!data.success) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Invalid list response');
    }
    const pairs = Array.isArray(data.pairs) ? data.pairs : [];
    return pairs
      .map((p) => String(p))
      .filter((p) => p !== '' && p.includes('|'));
  },

  async fetchQueuePage(knownSyncIds: string[], cursor = ''): Promise<FetchResult> {
    const settings = await this.getSettings();
    const apiUrl = strapi.plugin('brandstory-ai').service('settings').insertApiUrl(settings);
    if (!apiUrl) {
      return { posts: [], files: [], meta: {}, error: 'Plugin is not configured.' };
    }

    const payload: Record<string, unknown> = {
      limit: LIST_LIMIT,
      knownSyncIds: knownSyncIds.map(String),
    };
    if (cursor.trim()) payload.cursor = cursor.trim();
    if (settings.folderPair && settings.firebaseUid) {
      payload.folder = settings.folderPair;
      payload.firebaseUid = settings.firebaseUid;
      payload.includePosts = true;
    }

    let data: Record<string, unknown>;
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: authHeaders(settings),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(QUEUE_TIMEOUT_MS),
      });
      if (!res.ok) {
        return {
          posts: [],
          files: [],
          meta: {},
          error: `Insert API returned HTTP ${res.status}`,
        };
      }
      data = await parseJson(res);
    } catch (err) {
      return {
        posts: [],
        files: [],
        meta: {},
        error: this.augmentLoopbackHint(
          formatFetchError(err, 'Queue fetch', QUEUE_TIMEOUT_MS),
          settings.siteUrl
        ),
      };
    }

    if (!data.success) {
      return {
        posts: [],
        files: [],
        meta: {},
        error: typeof data.error === 'string' ? data.error : 'Invalid API response',
      };
    }

    // Legacy: bulk posts only
    if (!Object.prototype.hasOwnProperty.call(data, 'blogs')) {
      return {
        posts: Array.isArray(data.posts) ? (data.posts as BrandstoryPost[]) : [],
        files: Array.isArray(data.files) ? (data.files as string[]) : [],
        meta: (data.metadata as Record<string, unknown>) || {},
      };
    }

    const lastMeta = (data.metadata as Record<string, unknown>) || {};
    const detailErrors: string[] = [];
    let accumPosts: BrandstoryPost[] = [];
    const accumFiles: string[] = [];

    const pushPost = (post: BrandstoryPost) => {
      accumPosts.push(post);
      const key = typeof post.s3_content_key === 'string' ? post.s3_content_key.trim() : '';
      if (key && !accumFiles.includes(key)) accumFiles.push(key);
    };

    // Folder-scoped with includePosts
    if (Array.isArray(data.posts) && data.posts.length > 0) {
      for (const row of data.posts) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        if (r.post && typeof r.post === 'object') {
          pushPost(r.post as BrandstoryPost);
          continue;
        }
        const cid = rowContentId(row);
        if (!cid) continue;
        try {
          const post = await this.fetchDetail(apiUrl, cid, settings);
          if (post) pushPost(post);
        } catch (e) {
          detailErrors.push(`${cid}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return {
        posts: accumPosts,
        files: accumFiles,
        meta: { ...lastMeta, detail_fetch_errors: detailErrors, detail_count: accumPosts.length },
      };
    }

    const blogs = Array.isArray(data.blogs) ? data.blogs : [];
    for (const row of blogs) {
      const cid = rowContentId(row);
      if (!cid) continue;
      try {
        const post = await this.fetchDetail(apiUrl, cid, settings);
        if (post) pushPost(post);
      } catch (e) {
        detailErrors.push(`${cid}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      posts: accumPosts,
      files: accumFiles,
      meta: { ...lastMeta, detail_fetch_errors: detailErrors, detail_count: accumPosts.length },
    };
  },

  async fetchDetail(
    insertApiUrl: string,
    contentId: string,
    settings: PluginSettings
  ): Promise<BrandstoryPost | null> {
    const detailUrl = `${insertApiUrl.replace(/\/+$/, '')}/${encodeURIComponent(contentId)}`;
    let res: Response;
    try {
      res = await fetch(detailUrl, {
        method: 'GET',
        headers: authHeaders(settings),
        signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(formatFetchError(err, `Detail ${contentId}`, DETAIL_TIMEOUT_MS));
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await parseJson(res);
    if (!data.success || !data.post || typeof data.post !== 'object') {
      throw new Error('invalid detail response');
    }
    return data.post as BrandstoryPost;
  },

  /**
   * Paginate through the insert list until no nextCursor (or max pages).
   */
  async fetchFullQueue(knownSyncIds: string[] = [], maxPages = 20): Promise<FetchResult> {
    let cursor = '';
    let posts: BrandstoryPost[] = [];
    let files: string[] = [];
    let meta: Record<string, unknown> = {};

    for (let page = 0; page < maxPages; page += 1) {
      const result = await this.fetchQueuePage(knownSyncIds, cursor);
      if (result.error) {
        return { posts, files, meta, error: result.error };
      }
      posts = mergePostsBySyncId(posts, result.posts);
      for (const f of result.files) {
        if (typeof f === 'string' && f.trim() && !files.includes(f.trim())) {
          files.push(f.trim());
        }
      }
      meta = result.meta;
      const next =
        typeof result.meta?.nextCursor === 'string' ? result.meta.nextCursor.trim() : '';
      if (!next) break;
      cursor = next;
    }

    return { posts, files, meta };
  },

  async requestArchive(contentKeys: string[]): Promise<void> {
    const settings = await this.getSettings();
    const archiveUrl = strapi.plugin('brandstory-ai').service('settings').archiveApiUrl(settings);
    if (!archiveUrl || contentKeys.length === 0) return;

    const workspace = settings.workspace;
    const filtered = contentKeys
      .map((k) => k.trim())
      .filter(
        (k) =>
          k &&
          k.includes(`${workspace}/`) &&
          !k.includes('/_archive/') &&
          !k.includes('/_archived/')
      );

    if (filtered.length === 0) return;

    const headers = authHeaders(settings);
    try {
      const res = await fetch(archiveUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ keys: filtered }),
        signal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS),
      });
      if (!res.ok) {
        strapi.log.warn(`[brandstory-ai] archive POST HTTP ${res.status}`);
      }
    } catch (err) {
      strapi.log.warn(
        `[brandstory-ai] archive POST failed: ${formatFetchError(err, 'Archive', ARCHIVE_TIMEOUT_MS)}`
      );
    }
  },
});
