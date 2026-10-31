# @lp-labs/react-sprite-editor

An original controlled pixel editor with a bounded Canvas 2D preview, palette,
frame timing and browser PNG export. React 18.2 or 19 is the only runtime peer.
There are no runtime dependencies; canvas is the browser's own implementation.

## Use

```sh
npm install @lp-labs/react-sprite-editor react react-dom
```

In a React application with CSS imports:

```tsx
import { useState } from "react";
import { SpriteEditor, createSprite } from "@lp-labs/react-sprite-editor";
import "@lp-labs/react-sprite-editor/styles.css";

export default function App() {
  const [value, setValue] = useState(() => createSprite(16, 16));
  const [pngUrl, setPngUrl] = useState("");
  return (
    <>
      <SpriteEditor
        value={value}
        onChange={setValue}
        onExport={async (blob) => {
          const reader = new FileReader();
          const url = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Could not read PNG"));
            reader.readAsDataURL(blob);
          });
          setPngUrl(url);
        }}
      />
      {pngUrl && <a href={pngUrl} download="sprite.png">Save exported PNG</a>}
    </>
  );
}
```

This data URL example requires no object URL cleanup. ESM named imports and
CommonJS `require` expose the same API. CSS is explicitly imported from the
`styles.css` subpath. No browser globals execute on module import, so server
imports work; rendering a live canvas or exporting PNG requires the browser.

## Component and complete types

`SpriteEditor(props: SpriteEditorProps)` requires `value: SpriteValue` and
`onChange(next: SpriteValue): void`. Persist each next value; inputs are never
mutated. The component has local active-frame, palette-selection, cursor, and
playback state.

```ts
type Pixel = string | null;
interface SpriteFrame { pixels: Pixel[]; duration: number }
interface SpriteValue {
  width: number;
  height: number;
  palette: string[];
  frames: SpriteFrame[];
}
interface PngOptions { frame?: number; scale?: number; sheet?: boolean }
```

`SpriteEditorProps` is also exported. Dimensions must be integers 1-64.
Each of 1-64 frames has exactly `width * height` row-major pixels, each `null`
(transparent) or a six-digit hex RGB string. Frame duration is an integer
16-60000 milliseconds. Palette contains 1-32 six-digit hex RGB strings.
Pixels need not belong to the palette; changing a palette does not recolor
existing pixels. Alpha colors are not supported; use `null` for transparency.

| Optional prop | Default | Meaning |
| --- | --- | --- |
| `onExport?: (png: Blob) => void \| Promise<void>` | absent | Enables frame/sheet PNG buttons; consumer chooses how to save |
| `disabled?: boolean` | `false` | Stops editing and pauses playback scheduling |
| `className?: string` | `""` | Extra root class |
| `style?: React.CSSProperties` | absent | Root style |
| `"aria-label"?: string` | `"Sprite editor"` | Root label |

## All runtime exports

* `SpriteEditor`: the component above.
* `createSprite(width = 16, height = 16): SpriteValue`: creates a fresh single
  transparent frame of duration 100 ms. Palette defaults to `"#17213a"`,
  `"#ffffff"`, `"#3859c7"`, `"#e75151"`. Invalid dimensions throw `RangeError`
  before allocating pixels.
* `validateSprite(value: SpriteValue): string[]`: returns constraint errors or
  `[]`. Requires the structurally typed schema, not arbitrary unknown JSON.
* `setPixel(value: SpriteValue, frame: number, x: number, y: number, color: Pixel):
  SpriteValue`: validates and immutably replaces one pixel. Frame and coordinates
  are zero-based integers. Throws `RangeError` for invalid input, color, or
  out-of-bounds frame/coordinates. Unchanged frames are structurally shared.
* `resizeSprite(value: SpriteValue, width: number, height: number): SpriteValue`:
  validates and resizes every frame, preserving the top-left overlap, cropping
  the rest and filling new cells with `null`. Throws `RangeError` on invalid
  input or dimensions. Palette and durations are preserved.
* `spriteToPng(value: SpriteValue, options?: PngOptions): Promise<Blob>`:
  validates and paints a fresh browser canvas. `frame` defaults to 0; `scale`
  defaults to 1 (integer 1-16); `sheet` defaults to false. A sheet places all
  frames horizontally in array order; frame selection is ignored for drawing
  sheets but still must be in bounds. Export dimensions cannot exceed 4096
  pixels per side. Pixels are integer nearest-neighbor blocks with transparent
  empty cells. The returned Blob has PNG content. Invalid data/options reject
  with `RangeError`; absent browser document, Canvas 2D, `toBlob`, or a null
  encoder result reject with `Error`. Native canvas exceptions also reject.

These are all runtime exports. There is no default export or custom error class.

## Editing, lifecycle and limits

Pointer dragging paints pixels with pointer capture. Arrow keys move the
zero-based cursor (shown to users as one-based coordinates), Space paints,
Delete/Backspace clears. The current color defaults to the first palette color;
Eraser selects transparent. New palette colors start at `"#3859c7"`. Duplicate
frame copies pixels and duration and selects the copy; Remove frame retains
at least one frame. Resize commits only valid integer dimensions immediately
and is destructive when shrinking. No undo is provided.

Playback loops through frames using their durations; timers are cleaned up
when disabled, stopped or unmounted. Editing is disabled while playing.
Frame/sheet export buttons use scale 1, report callback or encoder errors,
prevent overlapping export requests, and do not call `onExport` if encoding
finishes after unmount. An export already delivered to the consumer cannot be
cancelled. A canvas encoder cannot be forcibly aborted.

There is no image import, flood fill, layered drawing, onion skin, GIF/APNG,
packing algorithm, worker, arbitrary canvas injection or simulated server PNG
encoder. PNG sheets contain pixels only, not frame durations or animation
metadata. Canvas is mocked in jsdom tests; native encoder fidelity remains
browser-dependent. No production certification is claimed.

## Customization and accessibility

CSS is scoped to `.lpsp-editor`; use `--lpsp-accent`, root `style` or `className`.
The pixel canvas has a label, focus outline, keyboard editing and cursor text.
Palette buttons expose names and pressed states, and numeric/frame controls
have visible labels. Errors use `role="alert"` and export/frame status uses
`role="status"`. The canvas is a visual editing surface, not a fully screen-reader
described grid. Playback is user initiated; consumers should avoid starting it
for users who prefer reduced motion.

[Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) |

## License

[MIT](./LICENSE).

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
