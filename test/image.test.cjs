const assert = require('node:assert/strict');
const {test} = require('node:test');
const {decode} = require('sixel');
const {layout, renderImage, INPUT_ROWS} = require('../dist/image.js');

test('art and input remain within the terminal viewport', () => {
  for (const [cols, rows] of [[76, 27], [100, 30], [140, 44], [200, 55]]) {
    const l = layout(cols, rows, 9, 18);
    assert.ok(l, `expected an image for ${cols}x${rows}`);
    assert.ok(l.left >= 0 && l.left + l.width <= cols);
    assert.ok(l.top >= 1 && l.top + l.topRows + INPUT_ROWS + l.bottomRows <= rows);
    assert.ok(l.inputLeft > l.left && l.inputLeft + l.inputWidth <= l.left + l.width);
  }
  assert.equal(layout(70, 25, 9, 18), null);
});

test('both Sixel slices have exactly the planned pixel dimensions', async () => {
  const l = layout(100, 35, 9, 18);
  for (const [part, rows] of [['top', l.topRows], ['bottom', l.bottomRows]]) {
    const sixel = await renderImage(part, l.width * 9, rows * 18);
    assert.ok(sixel.startsWith('\x1bP'));
    assert.ok(sixel.endsWith('\x1b\\'));
    const picture = decode(sixel);
    // The encoder can expose up to two padded pixels past the raster width.
    assert.ok(picture.width >= l.width * 9 && picture.width <= l.width * 9 + 2);
    assert.equal(picture.height, rows * 18);
  }
});
