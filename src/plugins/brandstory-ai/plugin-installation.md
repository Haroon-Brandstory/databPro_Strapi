# Brandstory AI — Strapi plugin installation

Install this plugin into an existing **Strapi v5** backend so Brandstory blogs sync into your content types (e.g. Blog).

**Repo:** `git@github.com:product-brandstory/brandstory-ai-strapi-plugin.git`  
**Requires:** Strapi `^5`, Node `18–22`, access to rebuild/restart the app.

---

## 1. Add the plugin to the Strapi project

From the Strapi app root:

```bash
# Recommended: clone into local plugins folder
git clone git@github.com:product-brandstory/brandstory-ai-strapi-plugin.git src/plugins/brandstory-ai
```

Or copy the `strapi-plugin-brandstory-ai` folder to:

`src/plugins/brandstory-ai`

Do **not** rename the plugin folder randomly — keep `brandstory-ai` so it matches config.

---

## 2. Enable the plugin

Edit `config/plugins.ts` (or merge into existing export):

```ts
export default () => ({
  // ...existing plugins
  'brandstory-ai': {
    enabled: true,
    resolve: './src/plugins/brandstory-ai',
    config: {
      // Cron auto-import. Use '' to disable.
      cronSchedule: '0 */3 * * *',
    },
  },
});
```

---

## 3. Prepare the target content type

On every content type you will sync (usually **Blog**):

| Requirement | Notes |
|-------------|--------|
| **`brandstorySyncId`** | Unique **string** field — **required**. Hardcoded by the plugin (not a Settings dropdown). Filled automatically from Brandstory `sync_id` on import. Do **not** use slug. |
| Title / SEO / image / date | Map via admin Auto-map (e.g. `blogTitle`, `blogMetaTitle`, `blogMetaDescription`, `blogImage`, `blogDate`) |
| Body | Either a richtext field **or** Dynamic Zone (production pattern below) |

### Production Blog dynamic-zone pattern

| Purpose | Strapi path |
|---------|-------------|
| Title | `blogTitle` |
| Slug | `blogSlug` (optional uid) |
| Excerpt | `blogShortDesc` |
| SEO title / desc | `blogMetaTitle` / `blogMetaDescription` |
| Image / date | `blogImage` / `blogDate` |
| Sync id | `brandstorySyncId` |
| Body | `contentSection` → component `blog.blog-content` → richtext `blogContent` |

Component example: `blog.blog-content` with attribute `blogContent` (richtext).  
Optional sibling in DZ: `blog.blog-image`.

---

## 4. Build / restart

```bash
# Local
npm run develop
# or
npm run build && npm run start

# Docker
docker compose up --build
```

Hard-refresh the admin panel after restart.

---

## 5. Configure and test (admin)

1. Log into Strapi admin → sidebar **Brandstory AI**.
2. **Settings**
   - App site URL (e.g. `https://app.brandstory.ai`)
   - Workspace
   - Firebase UID
   - Optional API key
3. Click **Test connection**.
4. **Load folders** → select `project|folder` pair.
5. **Target content type** → select Blog (or your CT) → **Auto-map fields again**.
6. Confirm:
   - Sync ID is fixed to `brandstorySyncId` (shown as locked in Settings)
   - Body → **Dynamic zone** → `contentSection` → `blog.blog-content` → `blogContent`  
     (or a flat content field if you are not using DZ)
7. **Save connection**.
8. **Content queue** → **Fetch** → **Import**.
9. Verify:
   - **Content Manager** → open the entry → check mapped fields + `contentSection` / `blogContent`
   - **Brandstory AI → Sync logs** → status `success`

---

## 6. Developer checklist

- [ ] Plugin at `src/plugins/brandstory-ai`
- [ ] Enabled in `config/plugins.ts`
- [ ] App rebuilt / restarted
- [ ] **Brandstory AI** appears in admin sidebar
- [ ] Target CT has unique `brandstorySyncId`
- [ ] Auto-map + Save done
- [ ] Test connection OK
- [ ] Fetch + Import OK
- [ ] Entry shows title + body in expected fields / DZ

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No **Brandstory AI** menu | Plugin path / `enabled` / rebuild; hard-refresh admin |
| Import fails: Sync ID | Add `brandstorySyncId` (unique string), Auto-map again, Save |
| Body not in DZ | Settings: content mode = Dynamic zone; Auto-map; Save; Import again |
| Empty SEO / image / date | Auto-map again so fields point at real attrs (`blogMeta*`, `blogImage`, …), Save, Import |
| Old empty entries | Open a **newly imported** entry, or re-Import to upsert by sync id |

---

## Notes

- This is a **local Strapi plugin** (not Marketplace/npm one-click yet). Install once per Strapi backend.
- Cron import runs on the schedule in `config` unless disabled.
- Sibling dynamic-zone blocks (e.g. `blogImage` in `contentSection`) are kept on update; only the mapped content component HTML is refreshed.
