import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  resizeSprite,
  setPixel,
  spriteToPng,
  validateSprite,
  type Pixel,
  type SpriteValue,
} from './engine.js';

export * from './engine.js';

export interface SpriteEditorProps {
  value: SpriteValue;
  onChange: (value: SpriteValue) => void;
  onExport?: (png: Blob) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

export function SpriteEditor({
  value,
  onChange,
  onExport,
  disabled = false,
  className = '',
  style,
  'aria-label': label = 'Sprite editor',
}: SpriteEditorProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(value);
  const mounted = useRef(false);
  const drawing = useRef(false);
  const exporting = useRef(false);
  const help = useId();
  const [active, setActive] = useState(0);
  const [color, setColor] = useState<Pixel>(value.palette[0] ?? '#17213a');
  const [custom, setCustom] = useState('#3859c7');
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errors = validateSprite(value);
  const frame = Math.min(active, Math.max(0, value.frames.length - 1));
  const blocked = disabled || playing || errors.length > 0;
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => {
    if (blocked) drawing.current = false;
  }, [blocked]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      drawing.current = false;
    };
  }, []);
  useEffect(() => {
    if (errors.length) return;
    const context = canvas.current?.getContext('2d');
    if (!context) {
      setError('Canvas 2D is unavailable; numeric and frame controls remain usable.');
      return;
    }
    context.clearRect(0, 0, value.width, value.height);
    value.frames[frame].pixels.forEach((pixel, index) => {
      if (pixel !== null) {
        context.fillStyle = pixel;
        context.fillRect(index % value.width, Math.floor(index / value.width), 1, 1);
      }
    });
  }, [value, frame, errors.length]);
  useEffect(() => {
    if (!playing || disabled || errors.length) return;
    const timer = setTimeout(
      () => setActive((frame + 1) % value.frames.length),
      value.frames[frame].duration,
    );
    return () => clearTimeout(timer);
  }, [playing, disabled, frame, value, errors.length]);
  const paint = (event: PointerEvent<HTMLCanvasElement>) => {
    if (blocked) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * value.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * value.height);
    if (x >= 0 && y >= 0 && x < value.width && y < value.height) {
      setCursor({ x, y });
      const next = setPixel(latest.current, frame, x, y, color);
      latest.current = next;
      onChange(next);
    }
  };
  const exportPng = async (sheet: boolean) => {
    if (exporting.current) return;
    exporting.current = true;
    setBusy(true);
    setError('');
    try {
      const png = await spriteToPng(value, { frame, sheet });
      if (mounted.current) await onExport?.(png);
    } catch (failure) {
      if (mounted.current) setError((failure as Error).message);
    } finally {
      exporting.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <section className={`lpsp-editor ${className}`} style={style} aria-label={label}>
      <p id={help}>
        Draw with pointer. Arrow keys move the pixel cursor; Space paints; Delete clears. Pixel{' '}
        {Math.min(cursor.x, value.width - 1) + 1}, {Math.min(cursor.y, value.height - 1) + 1}.
      </p>
      <canvas
        ref={canvas}
        width={errors.length ? 1 : value.width}
        height={errors.length ? 1 : value.height}
        tabIndex={disabled ? -1 : 0}
        role="img"
        aria-label="Pixel canvas"
        aria-describedby={help}
        aria-disabled={blocked}
        onPointerDown={(event) => {
          if (blocked) return;
          drawing.current = true;
          latest.current = value;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          paint(event);
        }}
        onPointerMove={(event) => {
          if (drawing.current) paint(event);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
        onLostPointerCapture={() => {
          drawing.current = false;
        }}
        onKeyDown={(event) => {
          if (blocked) return;
          const x = Math.min(cursor.x, value.width - 1);
          const y = Math.min(cursor.y, value.height - 1);
          if (
            [
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              ' ',
              'Delete',
              'Backspace',
            ].includes(event.key)
          )
            event.preventDefault();
          if (event.key === 'ArrowLeft') setCursor({ x: Math.max(0, x - 1), y });
          if (event.key === 'ArrowRight') setCursor({ x: Math.min(value.width - 1, x + 1), y });
          if (event.key === 'ArrowUp') setCursor({ x, y: Math.max(0, y - 1) });
          if (event.key === 'ArrowDown') setCursor({ x, y: Math.min(value.height - 1, y + 1) });
          if (event.key === ' ' || event.key === 'Delete' || event.key === 'Backspace')
            onChange(setPixel(value, frame, x, y, event.key === ' ' ? color : null));
        }}
      >
        Canvas 2D is required for the pixel preview.
      </canvas>
      <fieldset disabled={disabled || playing || errors.length > 0}>
        <legend>Pixel tools</legend>
        {value.palette.map((item, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Color ${item}`}
            aria-pressed={color === item}
            style={{ borderColor: item }}
            onClick={() => setColor(item)}
          >
            {item}
          </button>
        ))}
        <button type="button" aria-pressed={color === null} onClick={() => setColor(null)}>
          Eraser
        </button>
        <label>
          New palette color
          <input type="color" value={custom} onChange={(event) => setCustom(event.target.value)} />
        </label>
        <button
          type="button"
          disabled={value.palette.length >= 32 || value.palette.includes(custom)}
          onClick={() => {
            onChange({ ...value, palette: [...value.palette, custom] });
            setColor(custom);
          }}
        >
          Add color
        </button>
        {(['width', 'height'] as const).map((key) => (
          <label key={key}>
            {key}
            <input
              type="number"
              min={1}
              max={64}
              value={value[key]}
              onChange={(event) => {
                const n = event.target.valueAsNumber;
                if (Number.isInteger(n) && n >= 1 && n <= 64)
                  onChange(
                    resizeSprite(
                      value,
                      key === 'width' ? n : value.width,
                      key === 'height' ? n : value.height,
                    ),
                  );
              }}
            />
          </label>
        ))}
        <label>
          Frame
          <select value={frame} onChange={(event) => setActive(Number(event.target.value))}>
            {value.frames.map((_, index) => (
              <option key={index} value={index}>
                {index + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          Frame duration (ms)
          <input
            type="number"
            min={16}
            max={60000}
            value={value.frames[frame]?.duration ?? 100}
            onChange={(event) => {
              const duration = event.target.valueAsNumber;
              if (Number.isInteger(duration) && duration >= 16 && duration <= 60000)
                onChange({
                  ...value,
                  frames: value.frames.map((item, index) =>
                    index === frame ? { ...item, duration } : item,
                  ),
                });
            }}
          />
        </label>
        <button
          type="button"
          disabled={value.frames.length >= 64}
          onClick={() => {
            onChange({
              ...value,
              frames: [
                ...value.frames,
                { ...value.frames[frame], pixels: [...value.frames[frame].pixels] },
              ],
            });
            setActive(value.frames.length);
          }}
        >
          Duplicate frame
        </button>
        <button
          type="button"
          disabled={value.frames.length <= 1}
          onClick={() => {
            onChange({ ...value, frames: value.frames.filter((_, index) => index !== frame) });
            setActive(Math.max(0, frame - 1));
          }}
        >
          Remove frame
        </button>
      </fieldset>
      <button
        type="button"
        disabled={disabled || errors.length > 0}
        onClick={() => setPlaying(!playing)}
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      {onExport && (
        <>
          <button
            type="button"
            disabled={disabled || busy || errors.length > 0}
            onClick={() => void exportPng(false)}
          >
            Export frame PNG
          </button>
          <button
            type="button"
            disabled={disabled || busy || errors.length > 0}
            onClick={() => void exportPng(true)}
          >
            Export sheet PNG
          </button>
        </>
      )}
      {(errors.length > 0 || error) && (
        <p role="alert">
          {errors.join(' ')} {error}
        </p>
      )}
      <span role="status">
        {busy ? 'Exporting PNG' : `Frame ${frame + 1} of ${value.frames.length}`}
      </span>
    </section>
  );
}
