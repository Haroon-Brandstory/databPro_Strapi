import type { Core } from '@strapi/strapi';
import type { ContentWriteMode, DynamicZoneMap, FieldMap, PluginSettings } from './types';
import {
  BSD_BLOG_DYNAMIC_ZONE,
  BSD_BLOG_FIELD_MAP,
  BSD_BLOG_UID,
  SYNC_ID_FIELD,
} from './types';

type Attr = {
  type?: string;
  multiple?: boolean;
  allowedTypes?: string[];
  components?: string[];
};

const STRINGISH = new Set(['string', 'text', 'uid', 'email']);
const HTML_TYPES = new Set(['richtext', 'text', 'string', 'blocks', 'customField', 'json']);
const EXCERPT_TYPES = new Set(['text', 'string', 'richtext']);
const DATETIME = new Set(['datetime', 'date']);

function looksLikeBsdBlog(attrs: Record<string, Attr>): boolean {
  return Boolean(
    attrs.blogTitle &&
      attrs.contentSection?.type === 'dynamiczone' &&
      Array.isArray(attrs.contentSection.components) &&
      attrs.contentSection.components.includes('element.blog-content')
  );
}

function applyBsdBlogMap(attrs: Record<string, Attr>): {
  fieldMap: FieldMap;
  contentMode: ContentWriteMode;
  dynamicZone: DynamicZoneMap;
} {
  const fm: FieldMap = { ...BSD_BLOG_FIELD_MAP };
  // Only keep targets that exist on the CT.
  for (const key of Object.keys(fm) as Array<keyof FieldMap>) {
    const name = fm[key];
    if (!name) continue;
    if (!attrs[name]) fm[key] = '';
  }
  fm.syncId = attrs[SYNC_ID_FIELD] ? SYNC_ID_FIELD : '';

  const dzOk =
    attrs[BSD_BLOG_DYNAMIC_ZONE.field]?.type === 'dynamiczone' &&
    Array.isArray(attrs[BSD_BLOG_DYNAMIC_ZONE.field]?.components) &&
    attrs[BSD_BLOG_DYNAMIC_ZONE.field]!.components!.includes(BSD_BLOG_DYNAMIC_ZONE.component);

  return {
    fieldMap: fm,
    contentMode: dzOk ? 'dynamiczone' : 'field',
    dynamicZone: dzOk ? { ...BSD_BLOG_DYNAMIC_ZONE } : { field: '', component: '', htmlField: '' },
  };
}

function attrsOf(strapi: Core.Strapi, uid: string): Record<string, Attr> {
  const ct = strapi.contentTypes[uid];
  return (ct?.attributes || {}) as Record<string, Attr>;
}

function pickName(attrs: Record<string, Attr>, names: string[], types?: Set<string>): string {
  const entries = Object.entries(attrs);
  for (const want of names) {
    const hit = entries.find(
      ([name, a]) => name.toLowerCase() === want.toLowerCase() && (!types || types.has(String(a.type)))
    );
    if (hit) return hit[0];
  }
  for (const want of names) {
    const hit = entries.find(
      ([name, a]) =>
        name.toLowerCase().includes(want.toLowerCase()) && (!types || types.has(String(a.type)))
    );
    if (hit) return hit[0];
  }
  return '';
}

function firstOfType(attrs: Record<string, Attr>, types: Set<string>): string {
  const hit = Object.entries(attrs).find(([, a]) => types.has(String(a.type)));
  return hit?.[0] || '';
}

function singleImage(attrs: Record<string, Attr>): string {
  const media = Object.entries(attrs).filter(
    ([, a]) =>
      a.type === 'media' &&
      !a.multiple &&
      (!a.allowedTypes || a.allowedTypes.includes('images') || a.allowedTypes.length === 0)
  );
  const preferred = media.find(([name]) =>
    /blogimage|featured|cover|thumbnail|hero|og|image/i.test(name)
  );
  return preferred?.[0] || media[0]?.[0] || '';
}

function validTarget(attrs: Record<string, Attr>, name: string, types?: Set<string>): boolean {
  if (!name || !attrs[name]) return false;
  if (!types) return true;
  return types.has(String(attrs[name].type));
}

function htmlFieldOnComponent(strapi: Core.Strapi, componentUid: string): string {
  const comp = strapi.components[componentUid];
  const attrs = (comp?.attributes || {}) as Record<string, Attr>;
  return (
    pickName(
      attrs,
      ['blogContent', 'blogcontent', 'body', 'content', 'html', 'text', 'richtext', 'description'],
      HTML_TYPES
    ) || firstOfType(attrs, HTML_TYPES)
  );
}

function scoreComponent(strapi: Core.Strapi, uid: string): number {
  const comp = strapi.components[uid];
  const display = String(comp?.info?.displayName || '').toLowerCase();
  const low = uid.toLowerCase();
  let score = 0;
  if (/blogcontent|articlecontent|richtext|rich-text|markdown|html|body/.test(low)) score += 50;
  if (/blogcontent|article|content|rich\s*text|body/.test(display)) score += 40;
  if (/image|quote|gallery|video|embed|cta|hero/.test(low + display)) score -= 30;
  const htmlField = htmlFieldOnComponent(strapi, uid);
  if (htmlField) score += 20;
  if (/blogcontent/i.test(htmlField)) score += 25;
  return score;
}

/**
 * Drop field-map targets that do not exist on the CT and fill blanks with
 * production-style blog* names (and contentSection DZ when present).
 */
export function repairPluginSettings(
  strapi: Core.Strapi,
  settings: PluginSettings
): PluginSettings {
  const uid = settings.contentTypeUid;
  if (!uid || !strapi.contentTypes[uid]) return settings;

  const attrs = attrsOf(strapi, uid);

  // Always pin this project's Blog collection to the known field map.
  if (uid === BSD_BLOG_UID || looksLikeBsdBlog(attrs)) {
    const pinned = applyBsdBlogMap(attrs);
    return {
      ...settings,
      contentTypeUid: uid === BSD_BLOG_UID ? BSD_BLOG_UID : uid,
      fieldMap: pinned.fieldMap,
      contentMode: pinned.contentMode,
      dynamicZone: pinned.dynamicZone,
    };
  }

  const fm: FieldMap = { ...settings.fieldMap, slug: settings.fieldMap.slug || '' };

  const slots: Array<{
    key: keyof FieldMap;
    names: string[];
    types?: Set<string>;
    fallback?: () => string;
  }> = [
    {
      key: 'title',
      names: ['blogTitle', 'blog_title', 'articleTitle', 'postTitle', 'title', 'name', 'headline'],
      types: STRINGISH,
      fallback: () => firstOfType(attrs, STRINGISH),
    },
    {
      key: 'excerpt',
      names: [
        'blogShortDesc',
        'blogShortDescription',
        'blogExcerpt',
        'shortDescription',
        'excerpt',
        'summary',
      ],
      types: EXCERPT_TYPES,
    },
    {
      key: 'syncId',
      names: ['brandstorySyncId'],
      types: new Set([...STRINGISH, 'uid']),
    },
    {
      key: 'seoTitle',
      names: ['blogMetaTitle', 'blog_meta_title', 'seoTitle', 'metaTitle', 'seo_title'],
      types: STRINGISH,
    },
    {
      key: 'seoDescription',
      names: [
        'blogMetaDescription',
        'blog_meta_description',
        'seoDescription',
        'metaDescription',
      ],
      types: EXCERPT_TYPES,
    },
    {
      key: 'featuredImage',
      names: [],
      fallback: () => singleImage(attrs),
    },
    {
      key: 'publishedAt',
      names: ['blogDate', 'blog_date', 'sourcePublishedAt', 'publishedAt', 'publishDate', 'date'],
      types: DATETIME,
    },
    {
      key: 'coverS3Key',
      names: ['coverS3Key', 'cover_s3_key', 's3Key'],
      types: STRINGISH,
    },
    {
      key: 'slug',
      names: ['blogSlug', 'blog_slug', 'slug', 'uid'],
      types: STRINGISH,
    },
    {
      key: 'content',
      names: ['blogContent', 'content', 'body', 'html', 'article', 'postContent'],
      types: HTML_TYPES,
    },
  ];

  for (const slot of slots) {
    const current = fm[slot.key];
    const ok =
      slot.key === 'featuredImage'
        ? Boolean(current && attrs[current]?.type === 'media' && !attrs[current]?.multiple)
        : validTarget(attrs, current, slot.types);
    if (!ok) {
      fm[slot.key] =
        (slot.names.length ? pickName(attrs, slot.names, slot.types) : '') ||
        slot.fallback?.() ||
        '';
    }
  }

  const dzAttrs = Object.entries(attrs).filter(([, a]) => a.type === 'dynamiczone');
  const preferredDz =
    dzAttrs.find(([name]) => /contentsection|content_section/i.test(name)) ||
    dzAttrs.find(([name]) => /content|body|section|block|article|page|modular/i.test(name)) ||
    dzAttrs[0];

  let contentMode: ContentWriteMode = settings.contentMode === 'dynamiczone' ? 'dynamiczone' : 'field';
  let dynamicZone: DynamicZoneMap = { ...settings.dynamicZone };

  const zoneOk =
    contentMode === 'dynamiczone' &&
    dynamicZone.field &&
    attrs[dynamicZone.field]?.type === 'dynamiczone' &&
    dynamicZone.component &&
    Array.isArray(attrs[dynamicZone.field]?.components) &&
    attrs[dynamicZone.field]!.components!.includes(dynamicZone.component) &&
    Boolean(dynamicZone.htmlField);

  if (!zoneOk && preferredDz) {
    const allowed = preferredDz[1].components || [];
    const ranked = allowed
      .map((compUid) => ({
        uid: compUid,
        htmlField: htmlFieldOnComponent(strapi, compUid),
        score: scoreComponent(strapi, compUid),
      }))
      .filter((r) => r.htmlField)
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (best) {
      contentMode = 'dynamiczone';
      dynamicZone = {
        field: preferredDz[0],
        component: best.uid,
        htmlField: best.htmlField,
      };
      fm.content = '';
    }
  } else if (contentMode === 'dynamiczone') {
    fm.content = '';
  }

  if (contentMode === 'field' && !validTarget(attrs, fm.content, HTML_TYPES)) {
    fm.content =
      pickName(attrs, ['blogContent', 'content', 'body', 'html'], HTML_TYPES) ||
      firstOfType(attrs, HTML_TYPES);
  }

  // Fixed attribute name — only blank if CT does not have it yet.
  fm.syncId = attrs[SYNC_ID_FIELD] ? SYNC_ID_FIELD : '';

  return {
    ...settings,
    fieldMap: fm,
    contentMode,
    dynamicZone,
  };
}
