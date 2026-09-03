import type { BrandstoryPost } from './types';

function htmlStringFromUnknown(v: unknown): string {
  if (typeof v === 'string' && v.trim()) {
    return v.trim();
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const rec = v as Record<string, unknown>;
    for (const k of ['rendered', 'raw', 'html', 'body', 'value'] as const) {
      const inner = rec[k];
      if (typeof inner === 'string' && inner.trim()) {
        return inner.trim();
      }
    }
  }
  return '';
}

export function bodyHtmlFromPost(item: BrandstoryPost): string {
  for (const key of [
    'content',
    'body_html',
    'body',
    'html',
    'post_content',
    'article_html',
    'articleHtml',
    'description',
    'excerpt',
  ] as const) {
    const s = htmlStringFromUnknown(item[key]);
    if (s) return s;
  }
  return '';
}

export function resolveTitle(item: BrandstoryPost): string {
  const direct = typeof item.title === 'string' ? item.title.trim() : '';
  if (direct) return direct.replace(/^\d+\.\s*/, '').trim() || 'Untitled';
  const meta = item.meta;
  if (meta && typeof meta.title === 'string' && meta.title.trim()) {
    return meta.title.trim().replace(/^\d+\.\s*/, '').trim() || 'Untitled';
  }
  return 'Untitled';
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function resolveSlug(item: BrandstoryPost, title: string): string {
  const pick = (k: string): string => {
    const v = item[k];
    return typeof v === 'string' ? v.trim() : '';
  };
  const meta = item.meta;
  const metaSlug = meta && typeof meta.slug === 'string' ? meta.slug.trim() : '';
  return (
    pick('slug') ||
    pick('blog_slug') ||
    pick('blogSlug') ||
    pick('post_slug') ||
    metaSlug ||
    slugifyTitle(title) ||
    ''
  );
}

export function resolveSyncId(item: BrandstoryPost): string {
  const sync = item.sync_id ?? item.id;
  return sync === undefined || sync === null ? '' : String(sync).trim();
}

export function resolveApiId(item: BrandstoryPost): string {
  if (item.id === undefined || item.id === null) return '';
  return String(item.id).trim();
}

export function resolveSeoTitle(item: BrandstoryPost, articleTitle: string): string {
  const pick = (k: string): string => {
    const v = item[k];
    return typeof v === 'string' ? v.trim() : '';
  };
  const meta = item.meta;
  const metaTitle =
    meta && typeof meta.metaTitle === 'string' ? meta.metaTitle.trim() : '';
  return pick('ai_seo_meta_title') || pick('seo_title') || metaTitle || articleTitle.trim() || '';
}

export function firstTextLineFromHtml(html: string): string {
  const withBreaks = html
    .replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const plain = withBreaks.replace(/<[^>]+>/g, ' ');
  const lines = plain
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return lines[0] ?? '';
}

export function resolveSeoDescription(item: BrandstoryPost, contentHtml: string): string {
  const pick = (k: string): string => {
    const v = item[k];
    return typeof v === 'string' ? v.trim() : '';
  };
  const meta = item.meta;
  const metaDesc =
    meta && typeof meta.description === 'string' ? meta.description.trim() : '';
  return (
    pick('ai_seo_meta_description') ||
    pick('meta_description') ||
    metaDesc ||
    firstTextLineFromHtml(contentHtml) ||
    ''
  );
}

export function resolveFeaturedImageSrc(item: BrandstoryPost): string | null {
  const keys = [
    'featured_image',
    'feature_image',
    'cover_image_base64',
    'thumbnail',
    'cover_image',
    'image',
    'hero_image',
    'og_image',
  ] as const;
  for (const key of keys) {
    const raw = item[key];
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (s) return s;
  }
  return null;
}

export function resolveCoverS3Key(item: BrandstoryPost): string {
  return typeof item.cover_s3_key === 'string' ? item.cover_s3_key.trim() : '';
}

export function escapeImgSrcForAttr(src: string): string {
  const s = src.trim();
  if (!s) return '';
  if (/^data:image\//i.test(s)) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Replace [IMAGE:n] placeholders with figure/img markup (mirrors WP plugin).
 */
export function injectImagePlaceholders(html: string, articleImages: unknown[]): string {
  if (!html) return html;

  const images = (Array.isArray(articleImages) ? articleImages : []).map((src) =>
    typeof src === 'string' && src.trim() ? src.trim() : ''
  );
  const hasAny = images.some(Boolean);

  if (!hasAny) {
    return html
      .replace(/<h[1-6][^>]*>\s*\[IMAGE:\d+\]\s*<\/h[1-6]>/gi, '')
      .replace(/\[IMAGE:\d+\]/gi, '');
  }

  let processed = html.replace(/<h[1-6][^>]*>\s*\[IMAGE:\d+\]\s*<\/h[1-6]>/gi, '');
  const existingImgCount = (processed.match(/<img/gi) || []).length;
  let replacedCount = 0;

  processed = processed.replace(/\[IMAGE:(\d+)\]/g, (_m, num: string) => {
    const n = Math.max(1, parseInt(num, 10));
    const img = images[n - 1] || '';
    if (!img) return '';
    replacedCount += 1;
    const esc = escapeImgSrcForAttr(img);
    return `<figure class="ai-cf-inline-img"><img src="${esc}" alt="Article image ${n}" /></figure>`;
  });

  const toPlace = images.filter(Boolean);
  if (replacedCount === 0 && existingImgCount === 0 && toPlace.length > 0) {
    const paragraphs = processed.split('</p>');
    const interval = Math.max(2, Math.floor(paragraphs.length / (toPlace.length + 1)));
    let imageIndex = 0;
    const mapped = paragraphs.map((para, idx) => {
      if (interval > 0 && (idx + 1) % interval === 0 && imageIndex < toPlace.length) {
        const img = toPlace[imageIndex];
        const slot = imageIndex + 1;
        imageIndex += 1;
        const esc = escapeImgSrcForAttr(img);
        const fig = `<figure class="ai-cf-inline-img"><img src="${esc}" alt="Article image ${slot}" /></figure>`;
        return `${para}</p>${fig}`;
      }
      return para;
    });
    processed = mapped.join('</p>');
  }

  return processed.replace(/\[IMAGE:\d+\]/gi, '');
}

export function prepareContentHtml(item: BrandstoryPost): string {
  let html = bodyHtmlFromPost(item);
  html = html.replace(/<h1[^>]*>.*?<\/h1>/gis, '');
  html = html.replace(/^\d+\.\s*/gm, '');
  html = html.trim();

  const articleImages = Array.isArray(item.article_images_base64)
    ? item.article_images_base64
    : [];
  const hasMarkers = /\[IMAGE:\d+\]/i.test(html);

  if (hasMarkers) {
    html = injectImagePlaceholders(html, articleImages);
  } else if (articleImages.length > 0) {
    const hasInlineImg = /<img[\s>]/i.test(html);
    if (!hasInlineImg) {
      for (const src of articleImages) {
        if (typeof src !== 'string' || !src.trim()) continue;
        const esc = escapeImgSrcForAttr(src.trim());
        html += `\n\n<figure class="ai-cf-article-img"><img src="${esc}" alt="" /></figure>`;
      }
    }
  }

  return html;
}

export function mergePostsBySyncId(
  existing: BrandstoryPost[],
  incoming: BrandstoryPost[]
): BrandstoryPost[] {
  const map = new Map<string, BrandstoryPost>();
  for (const p of [...existing, ...incoming]) {
    const id = resolveSyncId(p);
    if (id) map.set(id, p);
  }
  return Array.from(map.values());
}
