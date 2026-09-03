#!/usr/bin/env node
import assert from 'node:assert/strict';

// Lightweight mirror of suggestMapping heuristics for blog* + contentSection pattern.
function pickByNames(attrs, names) {
  const lower = names.map((n) => n.toLowerCase());
  for (const name of lower) {
    const hit = attrs.find((a) => a.name.toLowerCase() === name);
    if (hit) return hit.name;
  }
  return '';
}

const attrs = [
  { name: 'blogTitle', type: 'string' },
  { name: 'blogSlug', type: 'string' },
  { name: 'blogMetaTitle', type: 'string' },
  { name: 'blogMetaDescription', type: 'text' },
  { name: 'blogImage', type: 'media', multiple: false, allowedTypes: ['images'] },
  { name: 'blogDate', type: 'date' },
  {
    name: 'contentSection',
    type: 'dynamiczone',
    components: ['blog.blog-content', 'blog.blog-image'],
  },
];

assert.equal(pickByNames(attrs, ['blogTitle', 'title']), 'blogTitle');
assert.equal(pickByNames(attrs, ['blogMetaDescription', 'metaDescription']), 'blogMetaDescription');
assert.equal(
  attrs.find((a) => a.type === 'dynamiczone')?.name,
  'contentSection'
);

console.log('Blog schema heuristic smoke tests passed.');
