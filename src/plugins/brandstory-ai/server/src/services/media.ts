import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Core } from '@strapi/strapi';

type UploadedFile = {
  id: number;
  documentId?: string;
  url?: string;
  [key: string]: unknown;
};

function extensionFromMimeOrUrl(contentType: string, urlHint: string): string {
  const fromCt = contentType.match(/image\/(\w+)/i);
  if (fromCt) {
    const t = fromCt[1].toLowerCase();
    return t === 'jpeg' ? 'jpg' : t;
  }
  const fromUrl = urlHint.match(/\.(jpg|jpeg|png|gif|webp)(?:\?|$)/i);
  if (fromUrl) {
    const t = fromUrl[1].toLowerCase();
    return t === 'jpeg' ? 'jpg' : t;
  }
  return 'jpg';
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async uploadFromDataUrlOrUrl(
    imageData: string,
    filenameBase = 'brandstory-image'
  ): Promise<UploadedFile | null> {
    const safeBase = filenameBase.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'brandstory-image';
    let buffer: Buffer;
    let extension = 'jpg';

    const dataMatch = imageData.match(/^data:image\/(\w+);base64,(.+)$/s);
    if (dataMatch) {
      extension = dataMatch[1].toLowerCase() === 'jpeg' ? 'jpg' : dataMatch[1].toLowerCase();
      buffer = Buffer.from(dataMatch[2], 'base64');
    } else if (/^https?:\/\//i.test(imageData) || imageData.startsWith('//')) {
      const url = imageData.startsWith('//') ? `https:${imageData}` : imageData;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) {
          strapi.log.warn(`[brandstory-ai] image download HTTP ${res.status}: ${url}`);
          return null;
        }
        const ct = res.headers.get('content-type') || '';
        extension = extensionFromMimeOrUrl(ct, url);
        buffer = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        strapi.log.warn(
          `[brandstory-ai] image download failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return null;
      }
    } else {
      strapi.log.warn('[brandstory-ai] invalid image format (need data URL or http URL)');
      return null;
    }

    const tmpPath = path.join(os.tmpdir(), `brandstory-${randomUUID()}.${extension}`);
    try {
      fs.writeFileSync(tmpPath, buffer);
      const stats = fs.statSync(tmpPath);
      const mime = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
      const uploaded = await strapi.plugin('upload').service('upload').upload({
        data: {
          fileInfo: {
            name: `${safeBase}.${extension}`,
            alternativeText: safeBase,
            caption: '',
          },
        },
        files: {
          filepath: tmpPath,
          originalFilename: `${safeBase}.${extension}`,
          mimetype: mime,
          size: stats.size,
        },
      });

      const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
      return (file as UploadedFile) || null;
    } catch (err) {
      strapi.log.warn(
        `[brandstory-ai] media upload failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    } finally {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
    }
  },

  /**
   * Find existing media by cover S3 key stored in provider_metadata / custom field.
   * We store key on upload via fileInfo.name pattern + strapi query on alternativeText prefix.
   */
  async findByCoverS3Key(coverS3Key: string): Promise<UploadedFile | null> {
    if (!coverS3Key) return null;
    try {
      const files = await strapi.db.query('plugin::upload.file').findMany({
        where: {
          caption: `brandstory-cover:${coverS3Key}`,
        },
        limit: 1,
      });
      return files?.[0] || null;
    } catch {
      return null;
    }
  },

  async uploadCover(
    imageData: string,
    coverS3Key: string,
    filenameBase: string
  ): Promise<UploadedFile | null> {
    if (coverS3Key) {
      const existing = await this.findByCoverS3Key(coverS3Key);
      if (existing) return existing;
    }
    const uploaded = await this.uploadFromDataUrlOrUrl(imageData, filenameBase);
    if (uploaded && coverS3Key) {
      try {
        await strapi.db.query('plugin::upload.file').update({
          where: { id: uploaded.id },
          data: { caption: `brandstory-cover:${coverS3Key}` },
        });
      } catch {
        // non-fatal
      }
    }
    return uploaded;
  },

  /**
   * Replace data:image... src attributes in HTML with Media Library URLs.
   */
  async rewriteInlineDataImages(html: string, filenameBase: string): Promise<string> {
    if (!html || !/data:image\//i.test(html)) return html;

    const re = /src=["'](data:image\/[^"']+)["']/gi;
    const matches = [...html.matchAll(re)];
    if (matches.length === 0) return html;

    let out = html;
    let i = 0;
    for (const m of matches) {
      const dataUrl = m[1];
      const file = await this.uploadFromDataUrlOrUrl(dataUrl, `${filenameBase}-inline-${i}`);
      i += 1;
      if (file?.url) {
        out = out.split(dataUrl).join(file.url);
      }
    }
    return out;
  },

  normalizeMediaUrlKey(url: string): string {
    const s = (url || '').trim();
    if (!s) return '';
    try {
      if (/^https?:\/\//i.test(s)) {
        return new URL(s).pathname || s;
      }
    } catch {
      // ignore
    }
    return s.split('?')[0] || s;
  },

  async findByUrl(url: string): Promise<UploadedFile | null> {
    const raw = (url || '').trim();
    if (!raw) return null;
    const key = this.normalizeMediaUrlKey(raw);
    const candidates = Array.from(
      new Set([raw, key, key.startsWith('/') ? key : `/${key}`].filter(Boolean))
    );

    try {
      for (const candidate of candidates) {
        const exact = await strapi.db.query('plugin::upload.file').findMany({
          where: { url: candidate },
          limit: 1,
        });
        if (exact?.[0]) return exact[0] as UploadedFile;
      }

      // Fallback: match by filename suffix (local /uploads/x.png vs absolute CDN URL).
      const base = key.split('/').filter(Boolean).pop();
      if (base) {
        const rows = await strapi.db.query('plugin::upload.file').findMany({
          where: { url: { $endsWith: base } },
          limit: 5,
        });
        const hit =
          rows?.find((f: { url?: string }) => this.normalizeMediaUrlKey(f.url || '') === key) ||
          rows?.[0];
        if (hit) return hit as UploadedFile;
      }
    } catch (err) {
      strapi.log.warn(
        `[brandstory-ai] findByUrl failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return null;
  },

  toBlocksImageMedia(file: UploadedFile): Record<string, unknown> {
    const now = new Date().toISOString();
    return {
      id: file.id,
      documentId: file.documentId,
      url: file.url,
      name: file.name,
      alternativeText: file.alternativeText ?? null,
      caption: file.caption ?? null,
      width: file.width ?? null,
      height: file.height ?? null,
      formats: file.formats ?? null,
      hash: file.hash,
      ext: file.ext ?? null,
      mime: file.mime ?? null,
      size: file.size ?? 0,
      previewUrl: file.previewUrl ?? null,
      provider: file.provider ?? 'local',
      // Blocks image schema requires these timestamps on the embedded media object.
      createdAt: file.createdAt || now,
      updatedAt: file.updatedAt || now,
    };
  },

  /**
   * Ensure inline <img> sources exist in Media Library and return a src→media map
   * for Blocks image nodes.
   */
  async resolveInlineImagesForBlocks(
    html: string,
    filenameBase: string
  ): Promise<{ html: string; mediaBySrc: Record<string, Record<string, unknown>> }> {
    let out = await this.rewriteInlineDataImages(html, filenameBase);
    const mediaBySrc: Record<string, Record<string, unknown>> = {};
    if (!out) return { html: out, mediaBySrc };

    const srcs = [
      ...out.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
    ].map((m) => m[1]?.trim()).filter(Boolean) as string[];

    const unique = Array.from(new Set(srcs));
    let i = 0;
    for (const src of unique) {
      let file: UploadedFile | null = await this.findByUrl(src);

      if (!file && (/^https?:\/\//i.test(src) || src.startsWith('//') || /^data:image\//i.test(src))) {
        file = await this.uploadFromDataUrlOrUrl(src, `${filenameBase}-inline-${i}`);
        if (file?.url && file.url !== src) {
          out = out.split(src).join(file.url);
        }
      }

      i += 1;
      if (!file) continue;

      const media = this.toBlocksImageMedia(file);
      const keys = new Set(
        [src, String(file.url || ''), this.normalizeMediaUrlKey(src), this.normalizeMediaUrlKey(String(file.url || ''))].filter(
          Boolean
        )
      );
      for (const k of keys) mediaBySrc[k] = media;
    }

    return { html: out, mediaBySrc };
  },
});
