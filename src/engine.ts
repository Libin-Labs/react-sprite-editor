export type Pixel = string | null;

export interface SpriteFrame {
  pixels: Pixel[];
  duration: number;
}

export interface SpriteValue {
  width: number;
  height: number;
  palette: string[];
  frames: SpriteFrame[];
}

export interface PngOptions {
  frame?: number;
  scale?: number;
  sheet?: boolean;
}

function isColor(color: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(color);
}

function checkSize(width: number, height: number): void {
  if (![width, height].every((n) => Number.isInteger(n) && n >= 1 && n <= 64))
    throw new RangeError('Width and height must be integers from 1 to 64.');
}

export function createSprite(width = 16, height = 16): SpriteValue {
  checkSize(width, height);
  return {
    width,
    height,
    palette: ['#17213a', '#ffffff', '#3859c7', '#e75151'],
    frames: [{ pixels: Array<Pixel>(width * height).fill(null), duration: 100 }],
  };
}

export function validateSprite(value: SpriteValue): string[] {
  const errors: string[] = [];
  try {
    checkSize(value.width, value.height);
  } catch (error) {
    errors.push((error as Error).message);
  }
  if (
    !value.palette.length ||
    value.palette.length > 32 ||
    value.palette.some((color) => !isColor(color))
  )
    errors.push('Palette must contain 1-32 six-digit hex colors.');
  if (value.frames.length < 1 || value.frames.length > 64) errors.push('Use 1-64 frames.');
  for (const frame of value.frames) {
    if (!Number.isInteger(frame.duration) || frame.duration < 16 || frame.duration > 60000)
      errors.push('Frame duration must be an integer from 16 to 60000 ms.');
    if (
      frame.pixels.length !== value.width * value.height ||
      frame.pixels.some((pixel) => pixel !== null && !isColor(pixel))
    )
      errors.push('Each frame needs width * height pixels, each null or six-digit hex.');
  }
  return errors;
}

function assertSprite(value: SpriteValue): void {
  const errors = validateSprite(value);
  if (errors.length) throw new RangeError(errors.join(' '));
}

export function setPixel(
  value: SpriteValue,
  frame: number,
  x: number,
  y: number,
  color: Pixel,
): SpriteValue {
  assertSprite(value);
  if (
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame >= value.frames.length ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= value.width ||
    y >= value.height
  )
    throw new RangeError('Pixel or frame is outside the sprite.');
  if (color !== null && !isColor(color))
    throw new RangeError('Pixel must be null or a six-digit hex color.');
  return {
    ...value,
    frames: value.frames.map((item, index) =>
      index !== frame
        ? item
        : {
            ...item,
            pixels: item.pixels.map((pixel, i) => (i === y * value.width + x ? color : pixel)),
          },
    ),
  };
}

export function resizeSprite(value: SpriteValue, width: number, height: number): SpriteValue {
  assertSprite(value);
  checkSize(width, height);
  return {
    ...value,
    width,
    height,
    frames: value.frames.map((frame) => ({
      ...frame,
      pixels: Array.from({ length: width * height }, (_, i) => {
        const x = i % width;
        const y = Math.floor(i / width);
        return x < value.width && y < value.height ? frame.pixels[y * value.width + x] : null;
      }),
    })),
  };
}

export async function spriteToPng(value: SpriteValue, options: PngOptions = {}): Promise<Blob> {
  assertSprite(value);
  const { frame = 0, scale = 1, sheet = false } = options;
  if (!Number.isInteger(frame) || frame < 0 || frame >= value.frames.length)
    throw new RangeError('Frame is outside the sprite.');
  if (!Number.isInteger(scale) || scale < 1 || scale > 16)
    throw new RangeError('Scale must be an integer from 1 to 16.');
  const width = value.width * scale * (sheet ? value.frames.length : 1);
  const height = value.height * scale;
  if (width > 4096 || height > 4096)
    throw new RangeError('Export dimensions must not exceed 4096 pixels per side.');
  if (typeof document === 'undefined')
    throw new Error('PNG export requires a browser document and Canvas 2D with toBlob.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context || typeof canvas.toBlob !== 'function')
    throw new Error('PNG export requires Canvas 2D with toBlob.');
  context.imageSmoothingEnabled = false;
  const frames = sheet ? value.frames : [value.frames[frame]];
  frames.forEach((item, frameIndex) => {
    item.pixels.forEach((pixel, index) => {
      if (pixel !== null) {
        context.fillStyle = pixel;
        context.fillRect(
          (frameIndex * value.width + (index % value.width)) * scale,
          Math.floor(index / value.width) * scale,
          scale,
          scale,
        );
      }
    });
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas returned no PNG data.'))),
      'image/png',
    );
  });
}
