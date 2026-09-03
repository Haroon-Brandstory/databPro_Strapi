/**
 * Convert HTML (Brandstory body) into Strapi Blocks JSON.
 * Used when the mapped field type is `blocks` (not richtext).
 */

export type BlocksTextNode = {
  type: 'text';
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
};

export type BlocksLinkNode = {
  type: 'link';
  url: string;
  children: BlocksTextNode[];
};

export type BlocksInline = BlocksTextNode | BlocksLinkNode;

/** Media payload embedded in a Blocks image node (Media Library snapshot). */
export type BlocksImageMedia = {
  url: string;
  name?: string;
  alternativeText?: string | null;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  formats?: Record<string, unknown> | null;
  hash?: string;
  ext?: string | null;
  mime?: string | null;
  size?: number | null;
  previewUrl?: string | null;
  provider?: string | null;
  id?: number;
  documentId?: string;
  [key: string]: unknown;
};

export type BlocksImageNode = {
  type: 'image';
  image: BlocksImageMedia;
  children: [{ type: 'text'; text: '' }];
};

export type BlocksNode =
  | { type: 'paragraph'; children: BlocksInline[] }
  | { type: 'heading'; level: number; children: BlocksInline[] }
  | {
      type: 'list';
      format: 'ordered' | 'unordered';
      children: Array<{ type: 'list-item'; children: BlocksInline[] }>;
    }
  | { type: 'quote'; children: BlocksInline[] }
  | { type: 'code'; children: [BlocksTextNode] }
  | BlocksImageNode;

export type HtmlToBlocksOptions = {
  /** Map of img src → Media Library file (preferred for editor preview). */
  mediaBySrc?: Record<string, BlocksImageMedia | null | undefined>;
};

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function emptyText(): BlocksTextNode {
  return { type: 'text', text: '' };
}

function textNode(text: string, mods: Partial<BlocksTextNode> = {}): BlocksTextNode {
  const node: BlocksTextNode = { type: 'text', text: decodeEntities(text) };
  if (mods.bold) node.bold = true;
  if (mods.italic) node.italic = true;
  if (mods.underline) node.underline = true;
  if (mods.strikethrough) node.strikethrough = true;
  if (mods.code) node.code = true;
  return node;
}

function attr(html: string, name: string): string {
  const m = html.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

function filenameFromSrc(src: string): string {
  try {
    const pathPart = src.split('?')[0] || src;
    const base = pathPart.split('/').filter(Boolean).pop() || 'image';
    return decodeURIComponent(base);
  } catch {
    return 'image';
  }
}

function extFromName(name: string): string {
  const m = name.match(/(\.[a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

function mimeFromExt(ext: string): string {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    default:
      return 'image/jpeg';
  }
}

function normalizeSrcKey(src: string): string {
  const s = (src || '').trim();
  if (!s) return '';
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      return u.pathname || s;
    }
  } catch {
    // ignore
  }
  return s.split('?')[0] || s;
}

function lookupMedia(
  src: string,
  mediaBySrc?: HtmlToBlocksOptions['mediaBySrc']
): BlocksImageMedia | null {
  if (!src || !mediaBySrc) return null;
  const direct = mediaBySrc[src];
  if (direct) return direct;
  const key = normalizeSrcKey(src);
  if (key && mediaBySrc[key]) return mediaBySrc[key] || null;
  for (const [k, v] of Object.entries(mediaBySrc)) {
    if (!v) continue;
    if (normalizeSrcKey(k) === key) return v;
    if (v.url && normalizeSrcKey(String(v.url)) === key) return v;
  }
  return null;
}

function imageBlock(src: string, alt = '', mediaBySrc?: HtmlToBlocksOptions['mediaBySrc']): BlocksNode {
  const resolved = lookupMedia(src, mediaBySrc);
  if (resolved?.url) {
    return {
      type: 'image',
      image: {
        ...resolved,
        alternativeText: resolved.alternativeText ?? (alt || null),
      },
      children: [{ type: 'text', text: '' }],
    };
  }

  if (!src) {
    return { type: 'paragraph', children: [textNode(alt || 'Image')] };
  }

  const name = filenameFromSrc(src);
  const ext = extFromName(name);
  const now = new Date().toISOString();
  return {
    type: 'image',
    image: {
      url: src,
      name,
      alternativeText: alt || null,
      caption: null,
      width: null,
      height: null,
      formats: null,
      hash: name.replace(/\.[^.]+$/, '') || 'image',
      ext: ext || null,
      mime: mimeFromExt(ext),
      size: 0,
      previewUrl: null,
      provider: 'local',
      createdAt: now,
      updatedAt: now,
    },
    children: [{ type: 'text', text: '' }],
  };
}

/**
 * Parse inline HTML. Unknown tags are stripped (content kept) so leftovers like
 * `p></p>` / `cite>` never leak into Blocks text.
 */
function parseInlines(html: string, mods: Partial<BlocksTextNode> = {}): BlocksInline[] {
  const out: BlocksInline[] = [];
  const s = html || '';
  let i = 0;

  const pushText = (raw: string) => {
    if (!raw) return;
    const t = decodeEntities(raw);
    if (t) out.push(textNode(t, mods));
  };

  while (i < s.length) {
    if (s[i] !== '<') {
      const next = s.indexOf('<', i);
      pushText(next === -1 ? s.slice(i) : s.slice(i, next));
      i = next === -1 ? s.length : next;
      continue;
    }

    const rest = s.slice(i);

    const br = rest.match(/^<br\s*\/?>/i);
    if (br) {
      out.push(textNode('\n', mods));
      i += br[0].length;
      continue;
    }

    const open = rest.match(/^<(strong|b|em|i|u|s|strike|del|code|a|cite)(\s[^>]*)?>/i);
    if (open) {
      const tag = open[1].toLowerCase();
      const attrs = open[2] || '';
      i += open[0].length;
      const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
      const closeMatch = s.slice(i).match(closeRe);
      const inner = closeMatch ? s.slice(i, i + (closeMatch.index || 0)) : s.slice(i);
      i += closeMatch ? (closeMatch.index || 0) + closeMatch[0].length : s.length - i;

      if (tag === 'a') {
        const href = attrs.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] || '#';
        const kids = parseInlines(inner, mods).filter((n) => n.type === 'text') as BlocksTextNode[];
        out.push({
          type: 'link',
          url: decodeEntities(href),
          children: kids.length ? kids : [emptyText()],
        });
        continue;
      }

      const next = { ...mods };
      if (tag === 'strong' || tag === 'b') next.bold = true;
      if (tag === 'em' || tag === 'i' || tag === 'cite') next.italic = true;
      if (tag === 'u') next.underline = true;
      if (tag === 's' || tag === 'strike' || tag === 'del') next.strikethrough = true;
      if (tag === 'code') next.code = true;
      out.push(...parseInlines(inner, next));
      continue;
    }

    // Unknown / block / closing tags: drop markup, keep scanning (no `<` leak).
    const anyTag = rest.match(/^<\/?[a-zA-Z][^>]*>/);
    if (anyTag) {
      i += anyTag[0].length;
      continue;
    }

    // Lone `<` that is not a tag.
    pushText('<');
    i += 1;
  }

  return out.length ? out : [emptyText()];
}

/** Flatten nested block markup so quote/list inlines stay clean. */
function flattenBlockInner(html: string): string {
  return (html || '')
    .replace(/<\/?(?:p|div|span|section|article)[^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function listItems(html: string): Array<{ type: 'list-item'; children: BlocksInline[] }> {
  const items: Array<{ type: 'list-item'; children: BlocksInline[] }> = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const inner = flattenBlockInner(m[1]);
    items.push({ type: 'list-item', children: parseInlines(inner) });
  }
  if (items.length === 0) {
    items.push({ type: 'list-item', children: parseInlines(stripTags(html) || ' ') });
  }
  return items;
}

/**
 * Best-effort HTML → Strapi Blocks. Unknown tags are stripped; images become image blocks.
 */
export function htmlToBlocks(html: string, options: HtmlToBlocksOptions = {}): BlocksNode[] {
  const cleaned = (html || '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?(html|head|body|meta|link|script|style)[^>]*>/gi, '')
    .trim();

  if (!cleaned) {
    return [{ type: 'paragraph', children: [emptyText()] }];
  }

  const blocks: BlocksNode[] = [];
  const mediaBySrc = options.mediaBySrc;

  // Match top-level block-ish tags; keep leftover text as paragraphs.
  const chunkRe =
    /<(h([1-6])|p|ul|ol|blockquote|pre|figure|div)(\s[^>]*)?>([\s\S]*?)<\/\1>|<(img)(\s[^>]*?)\/?>/gi;

  let lastIndex = 0;
  let m: RegExpExecArray | null;
  const pushPlain = (slice: string) => {
    const plain = stripTags(slice);
    if (plain) blocks.push({ type: 'paragraph', children: parseInlines(slice) });
  };

  while ((m = chunkRe.exec(cleaned))) {
    if (m.index > lastIndex) {
      pushPlain(cleaned.slice(lastIndex, m.index));
    }
    lastIndex = m.index + m[0].length;

    // Lone <img ...>
    if ((m[5] || '').toLowerCase() === 'img') {
      const tag = m[0];
      const src = attr(tag, 'src');
      if (src) {
        blocks.push(imageBlock(src, attr(tag, 'alt'), mediaBySrc));
      }
      continue;
    }

    const tag = (m[1] || '').toLowerCase();
    const level = m[2] ? Number(m[2]) : 0;
    const inner = m[4] || '';

    if (tag.startsWith('h') && level >= 1 && level <= 6) {
      blocks.push({
        type: 'heading',
        level: Math.min(6, Math.max(1, level)) as number,
        children: parseInlines(inner),
      });
      continue;
    }

    if (tag === 'p' || tag === 'div') {
      if (/<img[\s>]/i.test(inner)) {
        const imgTag = inner.match(/<img\b[^>]*>/i)?.[0] || '';
        const src = attr(imgTag, 'src');
        if (src) {
          blocks.push(imageBlock(src, attr(imgTag, 'alt'), mediaBySrc));
        }
        const rest = stripTags(inner.replace(/<img\b[^>]*>/gi, ''));
        if (rest) blocks.push({ type: 'paragraph', children: parseInlines(rest) });
        continue;
      }
      const kids = parseInlines(inner);
      if (kids.some((n) => (n.type === 'text' ? n.text.trim() : true))) {
        blocks.push({ type: 'paragraph', children: kids });
      }
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      blocks.push({
        type: 'list',
        format: tag === 'ol' ? 'ordered' : 'unordered',
        children: listItems(inner),
      });
      continue;
    }

    if (tag === 'blockquote') {
      blocks.push({ type: 'quote', children: parseInlines(flattenBlockInner(inner)) });
      continue;
    }

    if (tag === 'pre') {
      blocks.push({
        type: 'code',
        children: [textNode(stripTags(inner))],
      });
      continue;
    }

    if (tag === 'figure') {
      const imgTag = inner.match(/<img\b[^>]*>/i)?.[0] || '';
      const src = attr(imgTag, 'src');
      if (src) {
        const alt =
          attr(imgTag, 'alt') ||
          stripTags(inner.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || '');
        blocks.push(imageBlock(src, alt, mediaBySrc));
      } else {
        const plain = stripTags(inner);
        if (plain) blocks.push({ type: 'paragraph', children: parseInlines(inner) });
      }
      continue;
    }

    pushPlain(m[0]);
  }

  if (lastIndex < cleaned.length) {
    pushPlain(cleaned.slice(lastIndex));
  }

  if (blocks.length === 0) {
    blocks.push({ type: 'paragraph', children: parseInlines(cleaned) });
  }

  return blocks;
}

/** Format body value for the target Strapi attribute type. */
export function formatBodyForAttributeType(
  html: string,
  attrType: string | undefined,
  options: HtmlToBlocksOptions = {}
): unknown {
  if (attrType === 'blocks' || attrType === 'json') {
    return htmlToBlocks(html, options);
  }
  return html;
}

