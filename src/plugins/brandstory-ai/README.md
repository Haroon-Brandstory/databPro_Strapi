# Brandstory AI — Strapi v5 plugin

Syncs Brandstory AI CONTENT FACTORY blogs into Strapi content types.

## Features

- Admin section: **Brandstory AI**
- Configure app site URL, workspace, optional API key, Firebase UID, project/folder
- Test connection
- Load folders, refresh queue, import posts
- Media Library import (base64 + URL, featured + inline images, `[IMAGE:n]`)
- Create/update by `brandstorySyncId` on a configurable content type
- Draft or published status
- Sync logs (`plugin::brandstory-ai.sync-log`)
- Cron auto-import (default every 3 hours)

## Layout

```
strapi-plugin-brandstory-ai/
  admin/          # React admin UI
  server/         # Controllers, services, sync-log CT
  strapi-admin.js
  strapi-server.js
```

## Install into a Strapi v5 app

1. Copy or symlink this folder to `src/plugins/brandstory-ai`.
2. Enable in `config/plugins.ts`:

```ts
export default () => ({
  'brandstory-ai': {
    enabled: true,
    resolve: './src/plugins/brandstory-ai',
    config: {
      cronSchedule: '0 */3 * * *', // empty string to disable
    },
  },
});
```

3. Create a target content type with fields matching the field map (defaults):

| Strapi field | Purpose |
|---|---|
| `title` | Title |
| `content` | HTML body (richtext/text) |
| `excerpt` | Excerpt |
| `brandstorySyncId` | Unique sync id (string, unique) |
| `seoTitle` / `seoDescription` | SEO |
| `featuredImage` | Media |
| `sourcePublishedAt` | Source publish date |
| `coverS3Key` | Cover dedupe key |

4. Restart Strapi. Open **Brandstory AI** in the admin sidebar.

## Multi-app / Blog dynamic-zone pattern

Typical Brandstory marketing blogs map like this:

| Brandstory | Strapi field |
|---|---|
| title | `blogTitle` |
| excerpt / SEO desc | `blogShortDesc` / `blogMetaDescription` |
| SEO title | `blogMetaTitle` |
| featured image | `blogImage` |
| published date | `blogDate` |
| HTML body | `contentSection` → `BlogContent` → `blogContent` (richtext) |

Recommended: add unique string **`brandstorySyncId`** on every synced content type.

On update, the plugin updates the first matching DZ content component and **keeps sibling blocks** (e.g. `blogImage` components in `contentSection`).

## API routes (admin)

| Method | Path | Action |
|---|---|---|
| GET | `/brandstory-ai/settings` | Load settings |
| PUT | `/brandstory-ai/settings` | Save settings |
| POST | `/brandstory-ai/test-connection` | Test Brandstory API |
| POST | `/brandstory-ai/folders` | Load project\|folder pairs |
| POST | `/brandstory-ai/fetch` | Refresh queue preview |
| POST | `/brandstory-ai/import` | Import/upsert queue |
| GET | `/brandstory-ai/logs` | Sync logs |
| GET | `/brandstory-ai/content-types` | List API content types |

## Brandstory API (same as WP plugin)

- `POST /api/{workspace}/blog/insert` — queue list
- `GET /api/{workspace}/blog/insert/{contentId}` — detail
- `GET /api/{workspace}/list?firebaseUid=` — folders
- `POST /api/{workspace}/blog/archive` — archive after insert

Optional API key is sent as `Authorization: Bearer` and `X-API-Key` when set.

## Tests

```bash
node strapi-plugin-brandstory-ai/scripts/test-content.mjs
```

## Phases delivered

1. Plugin scaffold (Strapi v5 TS)
2. Settings + Brandstory HTTP client
3. Admin routes (test / folders / fetch / import / logs)
4. Sync (media, upsert, draft/publish, archive)
5. Sync-log CT + cron
6. Admin UI + demo Strapi app (Docker)
