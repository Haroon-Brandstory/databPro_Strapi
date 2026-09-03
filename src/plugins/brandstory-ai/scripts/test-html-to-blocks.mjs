#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const file = pathToFileURL(
    path.join(__dirname, '../server/src/services/html-to-blocks.ts')
  ).href;
  const mod = await import(file);
  const { htmlToBlocks, formatBodyForAttributeType } = mod;

  const html = `
    <h2>Hello</h2>
    <p>This is <strong>bold</strong> and <em>italic</em>.</p>
    <ul><li>One</li><li>Two</li></ul>
    <figure class="x"><img src="/uploads/a.jpg" alt="A" /></figure>
  `;

  const blocks = htmlToBlocks(html);
  assert.ok(Array.isArray(blocks) && blocks.length >= 3);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[0].level, 2);
  assert.equal(blocks[1].type, 'paragraph');
  assert.ok(blocks[1].children.some((c) => c.type === 'text' && c.bold));
  assert.equal(blocks[2].type, 'list');
  assert.equal(blocks[2].format, 'unordered');
  const img = blocks.find((b) => b.type === 'image');
  assert.ok(img);
  assert.equal(img.image.url, '/uploads/a.jpg');
  assert.equal(img.image.alternativeText, 'A');

  // Nested/unknown tags must not leak as text (p></p>, cite>, etc.)
  const quoteHtml = `
    <blockquote>
      <p>Quote body</p>
      <p></p>
      <cite>Dr. Mya Ellison</cite>
    </blockquote>
  `;
  const quoteBlocks = htmlToBlocks(quoteHtml);
  const quote = quoteBlocks.find((b) => b.type === 'quote');
  assert.ok(quote);
  const joined = quote.children.map((c) => (c.type === 'text' ? c.text : '')).join('');
  assert.ok(!/<\/?[a-z]+>/i.test(joined), `tag leak in quote: ${joined}`);
  assert.ok(!/\bp>\s*\/?p>|\bcite>|\b\/cite>/i.test(joined), `broken tag leak: ${joined}`);
  assert.ok(joined.includes('Quote body'));
  assert.ok(joined.includes('Dr. Mya Ellison'));
  assert.ok(quote.children.some((c) => c.type === 'text' && c.italic && c.text.includes('Dr. Mya')));

  const withMedia = htmlToBlocks(
    `<p><img src="/uploads/b.png" alt="B" /></p>`,
    {
      mediaBySrc: {
        '/uploads/b.png': {
          id: 9,
          url: '/uploads/b.png',
          name: 'b.png',
          alternativeText: 'B',
          width: 100,
          height: 80,
          hash: 'b',
          ext: '.png',
          mime: 'image/png',
          size: 12,
          provider: 'local',
        },
      },
    }
  );
  assert.equal(withMedia[0].type, 'image');
  assert.equal(withMedia[0].image.id, 9);

  const asBlocks = formatBodyForAttributeType('<p>Hi</p>', 'blocks');
  assert.ok(Array.isArray(asBlocks));
  const asHtml = formatBodyForAttributeType('<p>Hi</p>', 'richtext');
  assert.equal(asHtml, '<p>Hi</p>');

  console.log('html-to-blocks smoke tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
