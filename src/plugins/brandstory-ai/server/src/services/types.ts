export type PublishStatus = 'draft' | 'published';

export type ContentWriteMode = 'field' | 'dynamiczone';

export type DynamicZoneMap = {
  /** Dynamic zone attribute on the content type */
  field: string;
  /** Component UID allowed in the zone, e.g. shared.rich-text */
  component: string;
  /** Attribute on that component that receives HTML */
  htmlField: string;
};

export type PluginSettings = {
  siteUrl: string;
  workspace: string;
  apiKey: string;
  firebaseUid: string;
  folderPair: string;
  /** Target Strapi content-type UID, e.g. api::blog.blog */
  contentTypeUid: string;
  fieldMap: FieldMap;
  /** How article HTML is written */
  contentMode: ContentWriteMode;
  dynamicZone: DynamicZoneMap;
  defaultPublishStatus: PublishStatus;
  importChunkSize: number;
};

/** Hardcoded Strapi attribute for Brandstory upsert / dedupe. */
export const SYNC_ID_FIELD = 'brandstorySyncId';

export type FieldMap = {
  title: string;
  /** Used when contentMode === 'field' */
  content: string;
  excerpt: string;
  /** Always SYNC_ID_FIELD — kept on FieldMap for settings shape / API compat */
  syncId: string;
  seoTitle: string;
  seoDescription: string;
  featuredImage: string;
  publishedAt: string;
  coverS3Key: string;
  /** Optional URL slug field (e.g. blogSlug) */
  slug: string;
};

/** This project's Blog collection type UID */
export const BSD_BLOG_UID = 'api::blog.blog';

/** Hardcoded map for api::blog.blog / contentSection → element.blog-content */
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

export const DEFAULT_FIELD_MAP: FieldMap = { ...BSD_BLOG_FIELD_MAP };

export const DEFAULT_DYNAMIC_ZONE: DynamicZoneMap = { ...BSD_BLOG_DYNAMIC_ZONE };

export const DEFAULT_SETTINGS: PluginSettings = {
  siteUrl: '',
  workspace: '',
  apiKey: '',
  firebaseUid: '',
  folderPair: '',
  contentTypeUid: BSD_BLOG_UID,
  fieldMap: { ...BSD_BLOG_FIELD_MAP },
  contentMode: 'dynamiczone',
  dynamicZone: { ...BSD_BLOG_DYNAMIC_ZONE },
  defaultPublishStatus: 'published',
  importChunkSize: 5,
};

export type BrandstoryPost = Record<string, unknown> & {
  id?: string | number;
  sync_id?: string | number;
  title?: string;
  content?: string;
  excerpt?: string;
  published_at?: string;
  featured_image?: string;
  feature_image?: string;
  cover_image_base64?: string;
  cover_s3_key?: string;
  s3_content_key?: string;
  article_images_base64?: unknown[];
  categories?: string[];
  tags?: string[];
  meta?: Record<string, unknown>;
  ai_seo_meta_title?: string;
  ai_seo_meta_description?: string;
  seo_title?: string;
  meta_description?: string;
};

export type SyncResult = {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  message: string;
  entries: Array<{ documentId: string; title: string; syncId: string; action: 'inserted' | 'updated' }>;
  archiveS3Keys: string[];
};

export type AttrInfo = {
  name: string;
  type: string;
  multiple?: boolean;
  required?: boolean;
  allowedTypes?: string[];
  /** For dynamiczone: allowed component UIDs */
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
