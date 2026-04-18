'use client';

import { memo, useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  precision: number;
  className?: string;
}

// Split a number into an ordered list of "glyphs" (digits, dot, comma separators).
function glyphsOf(value: number, precision: number): string[] {
  if (!Number.isFinite(value)) return ['—'];
  const fixed = value.toFixed(precision);
  return fixed.split('');
}

interface DigitCellProps {
  glyph: string;
  token: number; // increments when value changes, used as animation key
}

function DigitCell({ glyph, token }: DigitCellProps) {
  const [prev, setPrev] = useState(glyph);
  const [curr, setCurr] = useState(glyph);
  const [flipToken, setFlipToken] = useState(0);
  const initialRef = useRef(true);

  useEffect(() => {
    if (initialRef.current) {
      initialRef.current = false;
      setPrev(glyph);
      setCurr(glyph);
      return;
    }
    if (glyph !== curr) {
      setPrev(curr);
      setCurr(glyph);
      setFlipToken((n) => n + 1);
    }
  }, [glyph, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPunct = glyph === '.' || glyph === ',' || glyph === '—';

  if (isPunct) {
    return <span className="inline-block text-brass opacity-70 mx-[0.02em]">{glyph}</span>;
  }

  if (prev === curr) {
    return <span className="inline-block w-[0.58em] text-center tabular-nums">{curr}</span>;
  }

  return (
    <span className="flip-digit inline-block" key={flipToken}>
      <span className="flip-old">{prev}</span>
      <span className="flip-new">{curr}</span>
    </span>
  );
}

const MemoCell = memo(DigitCell);

export function FlipNumber({ value, precision, className }: Props) {
  const glyphs = glyphsOf(value, precision);
  const tokenRef = useRef(0);
  // Bump token every time the numerical value changes so cells receive a fresh trigger.
  const [token, setToken] = useState(0);
  useEffect(() => {
    tokenRef.current += 1;
    setToken(tokenRef.current);
  }, [value]);

  return (
    <span
      className={`font-mono inline-flex ${className ?? ''}`}
      role="text"
      aria-live="off"
      aria-atomic="true"
      // aria-label set once per render but with aria-live=off screen readers
      // only announce on focus, not every 3s tick.
      aria-label={`Price ${value.toFixed(precision)}`}
    >
      {glyphs.map((g, i) => (
        <MemoCell key={i} glyph={g} token={token} />
      ))}
    </span>
  );
}
