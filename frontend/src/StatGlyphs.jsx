import { useMemo } from 'react';
import { Moon, Clock, Captions, Languages, Globe, Lock } from 'lucide-react';
import Mascot from './Mascot';
import './StatGlyphs.css';

/* ─────────────────────────────────────────────────────────────────
   Stat & feature glyphs — the small icon-scale visual language for
   dashboard stat cards and feature callouts.

   Rules this file follows (per design direction):
     - No raster artwork. Everything here is SVG, an existing lucide-
       react icon, or our own <Mascot />, styled/colored with CSS.
     - Reuse before inventing: the bloom stat reuses <Mascot>, the
       four feature glyphs reuse plain lucide-react icons — we only
       hand-build SVG where lucide doesn't have an equivalent
       (the letter tiles, the mini constellation).
     - Every stat glyph renders inside <GlyphFrame>, a fixed-size box
       that reserves room for glow bleed and sparkles and always adds
       margin below itself. That's what stops the icon from ever
       colliding with a label sitting underneath it — the frame owns
       the spacing, not whatever card happens to render it.
   ───────────────────────────────────────────────────────────────── */

/**
 * GlyphFrame — fixed-size box every stat glyph renders inside. Also
 * where the shared sparkle + float treatment lives, so "add sparkles/
 * float/glow to all of these" is one place to look, not four.
 */
function GlyphFrame({ children, sparkles = true, className = '' }) {
  return (
    <span className={`glyph-frame ${className}`}>
      <span className="glyph-frame-float">
        {children}
        {sparkles && (
          <>
            <span className="glyph-sparkle glyph-sparkle--a twinkle" aria-hidden="true">✦</span>
            <span className="glyph-sparkle glyph-sparkle--b twinkle" aria-hidden="true">✦</span>
          </>
        )}
      </span>
    </span>
  );
}

/**
 * GlowIcon — wraps any lucide-react icon with a color + soft glow.
 * This is the whole "visual treatment" for the four feature glyphs
 * (Accurate Subtitles / Multi-language / Global Reach / Private &
 * Secure): a real lucide icon, colored via currentColor, with a
 * CSS drop-shadow standing in for neon glow. No custom paths.
 *
 * Usage: <GlowIcon icon={Globe} color="var(--purple-bright)" />
 */
export function GlowIcon({ icon: Icon, size = 20, color = 'var(--purple-bright)', className = '' }) {
  return (
    <span
      className={`glow-icon ${className}`}
      style={{ color, '--glow-color': color }}
    >
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}

/* The four feature glyphs, pre-wired to a lucide icon + brand color.
   Drop straight into dash-feature-icon slots. Left as-is per design
   review — no frame/sparkles here, those are for the stat row. */
export const SubtitlesGlyph = (props) => <GlowIcon icon={Captions} color="#67e8f9" {...props} />;
export const MultiLanguageGlyph = (props) => <GlowIcon icon={Languages} color="#c084fc" {...props} />;
export const GlobalReachGlyph = (props) => <GlowIcon icon={Globe} color="#f472b6" {...props} />;
export const PrivateSecureGlyph = (props) => <GlowIcon icon={Lock} color="#5eead4" {...props} />;

/**
 * BloomGlyph — Active Uploads stat icon. Reuses the real <Mascot />
 * instead of a one-off flower drawing, so the stat card and the
 * dashboard header always show the same character. Defaults to the
 * "active" state — florets fanned open, swaying — since this glyph
 * represents uploads that are currently processing, not the resting/
 * idle bud look.
 */
export function BloomGlyph({ size = 34, state = 'active' }) {
  return (
    <GlyphFrame className="bloom-glyph-frame">
      <Mascot size={size} state={state} />
    </GlyphFrame>
  );
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTER_COLORS = ['#c084fc', '#f472b6', '#67e8f9'];

/** Pick 3 distinct random letters once per mount (not on every render). */
function useRandomLetters() {
  return useMemo(() => {
    const pool = ALPHABET.split('');
    const picked = [];
    while (picked.length < 3 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(i, 1)[0]);
    }
    return picked;
  }, []);
}

/**
 * WordsGlyph — Words Transcribed stat icon. Three glowing letters,
 * each gently floating on its own offset, standing in for "words"
 * without drawing a literal document/text icon.
 */
export function WordsGlyph() {
  const letters = useRandomLetters();
  return (
    <GlyphFrame className="words-glyph-frame">
      <span className="words-glyph" aria-hidden="true">
        {letters.map((ch, i) => (
          <span
            key={ch}
            className="words-glyph-letter"
            style={{ color: LETTER_COLORS[i], animationDelay: `${i * 0.4}s` }}
          >
            {ch}
          </span>
        ))}
      </span>
    </GlyphFrame>
  );
}

/* One color per constellation node — same brand palette used
   elsewhere (florets, feature glyphs), just applied per-star instead
   of a single flat lavender so the cluster reads as multi-language. */
const STAR_COLORS = ['#c084fc', '#67e8f9', '#f472b6', '#a78bfa'];

/**
 * LanguagesGlyph — Languages Used stat icon. A compact version of
 * the same hub-and-spoke constellation used in <LanguageConstellation>
 * on the full dashboard, just smaller, glowier, and multi-colored —
 * same visual grammar, icon scale.
 */
export function LanguagesGlyph({ size = 34 }) {
  const nodes = [
    { x: 16, y: 5 }, { x: 27, y: 14 }, { x: 23, y: 27 }, { x: 7, y: 23 },
  ];
  return (
    <GlyphFrame className="languages-glyph-frame">
      <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Languages used">
        <defs>
          <filter id="langGlyphGlow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {nodes.map((n, i) => {
          const next = nodes[(i + 1) % nodes.length];
          return (
            <line
              key={i}
              x1={n.x} y1={n.y} x2={next.x} y2={next.y}
              stroke="var(--purple-bright)"
              strokeWidth="0.9"
              opacity="0.65"
            />
          );
        })}
        {nodes.map((n, i) => (
          <circle
            key={i}
            cx={n.x} cy={n.y}
            r={i === 0 ? 2.8 : 2.2}
            fill={STAR_COLORS[i]}
            filter="url(#langGlyphGlow)"
          />
        ))}
      </svg>
    </GlyphFrame>
  );
}

/**
 * ExpiryGlyph — Next Expiry stat icon. Built entirely from two
 * lucide icons (Moon + Clock) layered and glowed with CSS, rather
 * than a hand-drawn moon/clock composite.
 */
export function ExpiryGlyph({ size = 28 }) {
  return (
    <GlyphFrame className="expiry-glyph-frame">
      <span className="expiry-glyph">
        <Moon size={size} strokeWidth={1.6} className="expiry-glyph-moon" />
        <Clock size={Math.round(size * 0.52)} strokeWidth={2} className="expiry-glyph-clock" />
      </span>
    </GlyphFrame>
  );
}