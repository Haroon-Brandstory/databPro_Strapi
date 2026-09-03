export type AttrInfo = {
  name: string;
  type: string;
  multiple?: boolean;
  required?: boolean;
  allowedTypes?: string[];
  components?: string[];
};

export type ComponentInfo = {
  uid: string;
  displayName: string;
  attributes: AttrInfo[];
};

export type ContentTypeInfo = {
  uid: string;
  displayName: string;
  attributes: AttrInfo[];
};

export type FieldMap = {
  title: string;
  content: string;
  excerpt: string;
  syncId: string;
  seoTitle: string;
  seoDescription: string;
  featuredImage: string;
  publishedAt: string;
  coverS3Key: string;
  slug: string;
};

/** Hardcoded Strapi attribute for Brandstory upsert / dedupe. */
export const SYNC_ID_FIELD = 'brandstorySyncId';

export const BSD_BLOG_UID = 'api::blog.blog';

export const BSD_BLOG_FIELD_MAP: FieldMap = {
  title: 'blogTitle',
  content: '',
  excerpt: '',
  syncId: SYNC_ID_FIELD,
  seoTitle: 'blogMetaTitle',
  seoDescription: 'blogMetaDescription',
  featuredImage: 'blogImage',
  publishedAt: 'blogDate',
  coverS3Key: '',
  slug: 'blogSlug',
};

export const BSD_BLOG_DYNAMIC_ZONE: DynamicZoneMap = {
  field: 'contentSection',
  component: 'element.blog-content',
  htmlField: 'blogContent',
};

export type DynamicZoneMap = {
  field: string;
  component: string;
  htmlField: string;
};

export type ContentWriteMode = 'field' | 'dynamiczone';

const HTML_TYPES = new Set(['richtext', 'text', 'string', 'blocks', 'customField', 'json']);
const STRINGISH = new Set(['string', 'text', 'uid', 'email']);
const DATETIME = new Set(['datetime', 'date']);
const EXCERPT_TYPES = new Set(['text', 'string', 'richtext']);

function pickByNames(attrs: AttrInfo[], names: string[], types?: Set<string>): string {
  const lower = names.map((n) => n.toLowerCase());
  for (const name of lower) {
    const hit = attrs.find(
      (a) => a.name.toLowerCase() === name && (!types || types.has(a.type))
    );
    if (hit) return hit.name;
  }
  for (const name of lower) {
    const hit = attrs.find(
      (a) => a.name.toLowerCase().includes(name) && (!types || types.has(a.type))
    );
    if (hit) return hit.name;
  }
  return '';
}

function firstOfType(attrs: AttrInfo[], types: Set<string>): string {
  return attrs.find((a) => types.has(a.type))?.name || '';
}

function singleImageField(attrs: AttrInfo[]): string {
  const media = attrs.filter(
    (a) =>
      a.type === 'media' &&
      !a.multiple &&
      (!a.allowedTypes || a.allowedTypes.includes('images') || a.allowedTypes.length === 0)
  );
  const preferred = media.find((a) =>
    /blogimage|featured|cover|thumbnail|hero|og|image/i.test(a.name)
  );
  return preferred?.name || media[0]?.name || '';
}

function htmlCapable(attrs: AttrInfo[]): AttrInfo[] {
  return attrs.filter((a) => HTML_TYPES.has(a.type));
}

function scoreContentComponent(comp: ComponentInfo): number {
  const uid = (comp.uid || '').toLowerCase();
  const name = (comp.displayName || '').toLowerCase();
  let score = 0;
  if (/blogcontent|articlecontent|richtext|rich-text|markdown|html|body/.test(uid)) score += 50;
  if (/blogcontent|article|content|rich\s*text|body/.test(name)) score += 40;
  if (/image|quote|gallery|video|embed|cta|hero/.test(uid + name)) score -= 30;
  const htmlField =
    pickByNames(
      comp.attributes,
      ['blogContent', 'blogcontent', 'body', 'content', 'html', 'text', 'richtext', 'description'],
      HTML_TYPES
    ) || firstOfType(htmlCapable(comp.attributes), HTML_TYPES);
  if (htmlField) score += 20;
  if (/blogcontent/i.test(htmlField)) score += 25;
  return score;
}

function pickHtmlFieldOnComponent(comp: ComponentInfo): string {
  return (
    pickByNames(
      comp.attributes,
      ['blogContent', 'blogcontent', 'body', 'content', 'html', 'text', 'richtext', 'description'],
      HTML_TYPES
    ) || firstOfType(htmlCapable(comp.attributes), HTML_TYPES)
  );
}

/**
 * Auto-select Brandstory → Strapi mappings.
 * Prefer this project's Blog CT: api::blog.blog + contentSection → element.blog-content.
 */
export function suggestMapping(
  ct: ContentTypeInfo | undefined,
  components: ComponentInfo[]
): {
  fieldMap: FieldMap;
  contentMode: ContentWriteMode;
  dynamicZone: DynamicZoneMap;
} {
  const attrs = ct?.attributes || [];

  // Pin exact map for Blog collection type used by this Strapi app.
  if (
    ct?.uid === BSD_BLOG_UID ||
    (attrs.some((a) => a.name === 'blogTitle') &&
      attrs.some(
        (a) =>
          a.name === 'contentSection' &&
          a.type === 'dynamiczone' &&
          (a.components || []).includes('element.blog-content')
      ))
  ) {
    const fm: FieldMap = { ...BSD_BLOG_FIELD_MAP };
    for (const key of Object.keys(fm) as Array<keyof FieldMap>) {
      if (fm[key] && !attrs.some((a) => a.name === fm[key])) fm[key] = '';
    }
    fm.syncId = attrs.some((a) => a.name === SYNC_ID_FIELD) ? SYNC_ID_FIELD : '';
    const dzComp = components.find((c) => c.uid === BSD_BLOG_DYNAMIC_ZONE.component);
    const htmlOk = Boolean(
      dzComp?.attributes.some((a) => a.name === BSD_BLOG_DYNAMIC_ZONE.htmlField)
    );
    return {
      fieldMap: fm,
      contentMode: htmlOk ? 'dynamiczone' : 'field',
      dynamicZone: htmlOk
        ? { ...BSD_BLOG_DYNAMIC_ZONE }
        : { field: '', component: '', htmlField: '' },
    };
  }

  const dzAttrs = attrs.filter((a) => a.type === 'dynamiczone');

  const fieldMap: FieldMap = {
    title:
      pickByNames(
        attrs,
        ['blogTitle', 'blog_title', 'articleTitle', 'postTitle', 'title', 'name', 'headline', 'heading'],
        STRINGISH
      ) || firstOfType(attrs, STRINGISH),
    content: '',
    excerpt: pickByNames(
      attrs,
      [
        'blogShortDesc',
        'blogShortDescription',
        'blogExcerpt',
        'shortDescription',
        'excerpt',
        'summary',
        'teaser',
        'description',
      ],
      EXCERPT_TYPES
    ),
    // Never map slug as sync id — Brandstory sync_id ≠ URL slug
    syncId: attrs.some((a) => a.name === SYNC_ID_FIELD) ? SYNC_ID_FIELD : '',
    seoTitle: pickByNames(
      attrs,
      ['blogMetaTitle', 'blog_meta_title', 'seoTitle', 'metaTitle', 'seo_title', 'meta_title'],
      STRINGISH
    ),
    seoDescription: pickByNames(
      attrs,
      [
        'blogMetaDescription',
        'blog_meta_description',
        'seoDescription',
        'metaDescription',
        'seo_description',
        'meta_description',
      ],
      EXCERPT_TYPES
    ),
    featuredImage: singleImageField(attrs),
    publishedAt: pickByNames(
      attrs,
      [
        'blogDate',
        'blog_date',
        'sourcePublishedAt',
        'publishedAt',
        'publishDate',
        'published_at',
        'date',
      ],
      DATETIME
    ),
    coverS3Key: pickByNames(attrs, ['coverS3Key', 'cover_s3_key', 's3Key'], STRINGISH),
    slug: pickByNames(attrs, ['blogSlug', 'blog_slug', 'slug'], STRINGISH),
  };

  const directContent = pickByNames(
    attrs,
    [
      'blogContent',
      'content',
      'body',
      'html',
      'article',
      'postContent',
      'articleBody',
      'blogBody',
    ],
    HTML_TYPES
  );

  // Prefer contentSection-style dynamic zones (marketing blogs) over flat richtext.
  const preferredDz =
    dzAttrs.find((a) => /contentsection|content_section/i.test(a.name)) ||
    dzAttrs.find((a) =>
      /content|body|section|block|article|page|modular/i.test(a.name)
    ) ||
    dzAttrs[0];

  let contentMode: ContentWriteMode = 'field';
  const dynamicZone: DynamicZoneMap = { field: '', component: '', htmlField: '' };

  if (preferredDz && preferredDz.components?.length) {
    const ranked = preferredDz.components
      .map((uid) => {
        const comp = components.find((c) => c.uid === uid);
        if (!comp) return null;
        const htmlField = pickHtmlFieldOnComponent(comp);
        if (!htmlField) return null;
        return { uid, htmlField, score: scoreContentComponent(comp) };
      })
      .filter(Boolean)
      .sort((a, b) => b!.score - a!.score) as Array<{
      uid: string;
      htmlField: string;
      score: number;
    }>;

    const best = ranked[0];
    // Always prefer DZ when a contentSection (or similar) has an HTML-capable component.
    // Flat `content` richtext is leftover / legacy — production blogs use DZ like screenshots.
    if (best) {
      contentMode = 'dynamiczone';
      dynamicZone.field = preferredDz.name;
      dynamicZone.component = best.uid;
      dynamicZone.htmlField = best.htmlField;
      fieldMap.content = '';
    }
  }

  if (contentMode === 'field') {
    fieldMap.content = directContent || firstOfType(htmlCapable(attrs), HTML_TYPES);
  }

  return { fieldMap, contentMode, dynamicZone };
}

export function attrsForSlot(attrs: AttrInfo[], slot: keyof FieldMap): AttrInfo[] {
  switch (slot) {
    case 'title':
    case 'syncId':
    case 'seoTitle':
    case 'coverS3Key':
    case 'slug':
      return attrs.filter((a) => STRINGISH.has(a.type) || a.type === 'uid');
    case 'content':
      return attrs.filter((a) => HTML_TYPES.has(a.type));
    case 'excerpt':
    case 'seoDescription':
      return attrs.filter((a) => EXCERPT_TYPES.has(a.type));
    case 'featuredImage':
      return attrs.filter((a) => a.type === 'media' && !a.multiple);
    case 'publishedAt':
      return attrs.filter((a) => DATETIME.has(a.type));
    default:
      return attrs;
  }
}

export const FIELD_MAP_LABELS: Array<[keyof FieldMap, string]> = [
  ['title', 'Title'],
  ['slug', 'Slug'],
  ['content', 'Content (HTML / rich text field)'],
  ['excerpt', 'Excerpt / short description'],
  ['seoTitle', 'SEO / meta title'],
  ['seoDescription', 'SEO / meta description'],
  ['featuredImage', 'Featured / blog image'],
  ['publishedAt', 'Publish / blog date'],
  ['coverS3Key', 'Cover S3 key'],
];
