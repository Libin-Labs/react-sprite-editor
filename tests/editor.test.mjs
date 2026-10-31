import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import {
  SpriteEditor,
  createSprite,
  resizeSprite,
  setPixel,
  spriteToPng,
  validateSprite,
} from '../dist/esm/index.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const contexts = new WeakMap();
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  if (!contexts.has(this))
    contexts.set(this, {
      fillStyle: '',
      calls: [],
      clearRect(...args) {
        this.calls.push(['clear', ...args]);
      },
      fillRect(...args) {
        this.calls.push([this.fillStyle, ...args]);
      },
    });
  return contexts.get(this);
};
let lastExportCanvas;
dom.window.HTMLCanvasElement.prototype.toBlob = function (callback, type) {
  lastExportCanvas = this;
  callback(new Blob(['mock PNG'], { type }));
};
const { createRoot } = await import('react-dom/client');
after(() => dom.window.close());

test('bounded immutable pixels, null transparency and top-left resize', () => {
  const value = createSprite(2, 2);
  const next = setPixel(value, 0, 1, 0, '#ff0000');
  assert.equal(value.frames[0].pixels[1], null);
  assert.equal(next.frames[0].pixels[1], '#ff0000');
  assert.deepEqual(resizeSprite(next, 3, 1).frames[0].pixels, [null, '#ff0000', null]);
  assert.equal(setPixel(next, 0, 1, 0, null).frames[0].pixels[1], null);
  assert.deepEqual(validateSprite(value), []);
  for (const size of [0, 65, 1.5, Infinity]) assert.throws(() => createSprite(size, 1), RangeError);
  for (const args of [
    [0, -1, 0, null],
    [2, 0, 0, null],
    [0, 2, 0, null],
    [0, 0, 0, 'red'],
  ])
    assert.throws(() => setPixel(value, ...args), RangeError);
  assert.throws(() => resizeSprite(value, 65, 1), RangeError);
  assert.ok(
    validateSprite({ ...value, frames: [{ pixels: ['<script>'], duration: 0 }] }).length >= 2,
  );
});

test('browser PNG frame/sheet scale bounds, canvas failure, and SSR error', async () => {
  const value = setPixel(createSprite(2, 1), 0, 1, 0, '#ff0000');
  value.frames.push({ pixels: ['#000000', null], duration: 100 });
  const blob = await spriteToPng(value, { sheet: true, scale: 2 });
  assert.equal(blob.type, 'image/png');
  assert.equal(lastExportCanvas.width, 8);
  assert.equal(lastExportCanvas.height, 2);
  assert.deepEqual(contexts.get(lastExportCanvas).calls, [
    ['#ff0000', 2, 0, 2, 2],
    ['#000000', 4, 0, 2, 2],
  ]);
  await spriteToPng(value, { frame: 1, scale: 3 });
  assert.equal(lastExportCanvas.width, 6);
  assert.deepEqual(contexts.get(lastExportCanvas).calls, [['#000000', 0, 0, 3, 3]]);
  await assert.rejects(spriteToPng(value, { scale: 17 }), RangeError);
  await assert.rejects(spriteToPng(value, { frame: -1 }), RangeError);
  const big = createSprite(64, 64);
  big.frames = Array.from({ length: 64 }, () => ({ ...big.frames[0] }));
  await assert.rejects(spriteToPng(big, { sheet: true, scale: 2 }), /4096/);
  const savedDocument = globalThis.document;
  delete globalThis.document;
  await assert.rejects(spriteToPng(value), /browser/);
  globalThis.document = savedDocument;
  const savedContext = dom.window.HTMLCanvasElement.prototype.getContext;
  dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  await assert.rejects(spriteToPng(value), /Canvas 2D/);
  dom.window.HTMLCanvasElement.prototype.getContext = savedContext;
  const savedBlob = dom.window.HTMLCanvasElement.prototype.toBlob;
  dom.window.HTMLCanvasElement.prototype.toBlob = (callback) => callback(null);
  await assert.rejects(spriteToPng(value), /no PNG/);
  dom.window.HTMLCanvasElement.prototype.toBlob = savedBlob;
});

test('keyboard and pointer painting, frame timing, timer cleanup and disabled state', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let value = createSprite(2, 2);
  const render = (disabled = false) =>
    root.render(
      React.createElement(SpriteEditor, {
        value,
        disabled,
        onChange: (next) => {
          value = next;
          render();
        },
      }),
    );
  await act(() => render());
  const canvas = host.querySelector('canvas');
  await act(() =>
    canvas.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true })),
  );
  assert.equal(value.frames[0].pixels[0], '#17213a');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  await act(() => {
    canvas.dispatchEvent(
      new dom.window.MouseEvent('pointerdown', { clientX: 75, clientY: 75, bubbles: true }),
    );
    canvas.dispatchEvent(
      new dom.window.MouseEvent('pointermove', { clientX: 75, clientY: 25, bubbles: true }),
    );
    canvas.dispatchEvent(
      new dom.window.MouseEvent('pointermove', { clientX: 25, clientY: 75, bubbles: true }),
    );
    canvas.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }));
  });
  assert.deepEqual(value.frames[0].pixels, ['#17213a', '#17213a', '#17213a', '#17213a']);
  const button = (text) =>
    [...host.querySelectorAll('button')].find((node) => node.textContent === text);
  await act(() => button('Duplicate frame').click());
  assert.equal(value.frames.length, 2);
  const timers = new Map();
  const savedSet = globalThis.setTimeout;
  const savedClear = globalThis.clearTimeout;
  let sequence = 0;
  globalThis.setTimeout = (fn, delay) => {
    timers.set(++sequence, { fn, delay });
    return sequence;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  try {
    await act(() => button('Play').click());
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].delay, 100);
    const [id, timer] = [...timers][0];
    timers.delete(id);
    await act(() => timer.fn());
    assert.match(host.querySelector('[role="status"]').textContent, /Frame 1 of 2/);
    await act(() => render(true));
    assert.equal(timers.size, 0);
    await act(() => root.unmount());
    assert.equal(timers.size, 0);
  } finally {
    globalThis.setTimeout = savedSet;
    globalThis.clearTimeout = savedClear;
  }
  host.remove();
});

test('in-flight export does not notify after unmount', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let finish;
  let exports = 0;
  const saved = dom.window.HTMLCanvasElement.prototype.toBlob;
  dom.window.HTMLCanvasElement.prototype.toBlob = (callback) => {
    finish = callback;
  };
  try {
    await act(() =>
      root.render(
        React.createElement(SpriteEditor, {
          value: createSprite(),
          onChange() {},
          onExport() {
            exports++;
          },
        }),
      ),
    );
    await act(() =>
      [...host.querySelectorAll('button')]
        .find((node) => node.textContent === 'Export frame PNG')
        .click(),
    );
    await act(() => root.unmount());
    await act(async () => {
      finish(new Blob(['png']));
      await Promise.resolve();
    });
    assert.equal(exports, 0);
  } finally {
    dom.window.HTMLCanvasElement.prototype.toBlob = saved;
    host.remove();
  }
});
