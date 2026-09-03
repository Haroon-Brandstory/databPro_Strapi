#!/usr/bin/env node
/**
 * Pure-JS mirror of content helpers for unit tests (no TS loader needed).
 */
import assert from 'node:assert/strict';

function resolveTitle(item) {
  const direct = typeof item.title === 'string' ? item.title.trim() : '';
  if (direct) return direct.replace(/^\d+\.\s*/, '').trim() || 'Untitled';
  return 'Untitled';
}

function resolveSyncId(item) {
  const sync = item.sync_id ?? item.id;
  return sync === undefined || sync === null ? '' : String(sync).trim();
}

function resolveSeoTitle(item, articleTitle) {
  const pick = (k) => (typeof item[k] === 'string' ? item[k].trim() : '');
  return pick('ai_seo_meta_title') || pick('seo_title') || articleTitle.trim() || '';
}

function firstTextLineFromHtml(html) {
  const withBreaks = html
    .replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const plain = withBreaks.replace(/<[^>]+>/g, ' ');
  return (
    plain
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)[0] ?? ''
  );
}

function resolveSeoDescription(item, contentHtml) {
  const pick = (k) => (typeof item[k] === 'string' ? item[k].trim() : '');
  return (
    pick('ai_seo_meta_description') ||
    pick('meta_description') ||
    firstTextLineFromHtml(contentHtml) ||
    ''
  );
}

function injectImagePlaceholders(html, articleImages) {
  const images = (articleImages || []).map((src) =>
    typeof src === 'string' && src.trim() ? src.trim() : ''
  );
  if (!images.some(Boolean)) {
    return html.replace(/\[IMAGE:\d+\]/gi, '');
  }
  return html.replace(/\[IMAGE:(\d+)\]/g, (_m, num) => {
    const n = Math.max(1, parseInt(num, 10));
    const img = images[n - 1] || '';
    if (!img) return '';
    return `<figure><img src="${img}" alt="Article image ${n}" /></figure>`;
  });
}

function prepareContentHtml(item) {
  let html = typeof item.content === 'string' ? item.content : '';
  html = html.replace(/<h1[^>]*>.*?<\/h1>/gis, '').trim();
  return html;
}

assert.equal(resolveTitle({ title: '1. Hello World' }), 'Hello World');
assert.equal(resolveSyncId({ id: 'a', sync_id: 'b' }), 'b');
assert.equal(resolveSeoTitle({ ai_seo_meta_title: 'SEO', title: 'T' }, 'T'), 'SEO');
assert.ok(resolveSeoDescription({}, '<p>First sentence. Second.</p>').includes('First'));
assert.ok(injectImagePlaceholders('Hello [IMAGE:1]', ['data:image/png;base64,abc']).includes('<img'));
assert.ok(!/<h1/i.test(prepareContentHtml({ content: '<h1>Title</h1><p>Body</p>' })));

console.log('All content unit tests passed.');
