// Decorative + structural SVG motifs inspired by The Bridge logo (suspension cables + pillars)

export function BridgeArc({
  className = '',
  stroke = 'currentColor',
  strokeWidth = 2,
  direction = 'right',
}: {
  className?: string
  stroke?: string
  strokeWidth?: number
  direction?: 'right' | 'left'
}) {
  const path =
    direction === 'right'
      ? 'M 600 0 Q 100 300 600 600'
      : 'M 0 0 Q 500 300 0 600'
  return (
    <svg viewBox="0 0 600 600" className={className} preserveAspectRatio="none" fill="none" aria-hidden>
      <path d={path} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  )
}

export function BridgeCables({
  className = '',
  stroke = 'currentColor',
  strokeWidth = 3,
}: {
  className?: string
  stroke?: string
  strokeWidth?: number
}) {
  return (
    <svg viewBox="0 0 800 400" className={className} preserveAspectRatio="none" fill="none" aria-hidden>
      <path d="M 50 80 Q 400 280 750 80" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M 50 320 Q 400 120 750 320" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  )
}

export function BridgeMark({
  className = '',
  color = 'currentColor',
}: {
  className?: string
  color?: string
}) {
  return (
    <svg viewBox="0 0 200 120" className={className} fill="none" aria-hidden>
      <rect x="22" y="14" width="5" height="92" fill={color} />
      <rect x="173" y="14" width="5" height="92" fill={color} />
      <path d="M 22 30 Q 100 76 178 30" stroke={color} strokeWidth="5" strokeLinecap="round" />
      <path d="M 22 90 Q 100 50 178 90" stroke={color} strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Large filled green panel with one concave edge — meant to live on the side of a section.
 * The opposite edge of `side` is the curved (concave) edge that "contains" the content next to it.
 */
export function CurvedSidePanel({
  side = 'right',
  className = '',
  fill = '#10b981',
}: {
  side?: 'right' | 'left'
  className?: string
  fill?: string
}) {
  // viewBox 400x1000 — paths designed so the curve is a soft arc on one edge
  const path =
    side === 'right'
      ? 'M 120 0 Q 0 500 120 1000 L 400 1000 L 400 0 Z'
      : 'M 0 0 L 280 0 Q 400 500 280 1000 L 0 1000 Z'
  return (
    <svg viewBox="0 0 400 1000" className={className} preserveAspectRatio="none" aria-hidden>
      <path d={path} fill={fill} />
    </svg>
  )
}

/**
 * Section divider — a horizontal sweep echoing the suspension cable curve of the logo.
 */
export function ArcDivider({
  className = '',
  color = '#10b981',
  variant = 'down',
}: {
  className?: string
  color?: string
  variant?: 'down' | 'up'
}) {
  const path = variant === 'down'
    ? 'M 0 20 Q 600 100 1200 20'
    : 'M 0 80 Q 600 0 1200 80'
  return (
    <svg viewBox="0 0 1200 100" className={className} preserveAspectRatio="none" fill="none" aria-hidden>
      <path d={path} stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="600" cy={variant === 'down' ? '70' : '30'} r="3" fill={color} />
    </svg>
  )
}

/**
 * Full-bleed green wave — a big green arc as a background panel for hero / final CTA.
 * `position` controls whether the curve bulges from top, bottom, right or left.
 */
export function GreenWave({
  className = '',
  fill = '#10b981',
  position = 'bottom',
}: {
  className?: string
  fill?: string
  position?: 'bottom' | 'top' | 'right' | 'left'
}) {
  let path = ''
  let viewBox = ''
  if (position === 'bottom') {
    viewBox = '0 0 1200 400'
    path = 'M 0 400 Q 600 0 1200 400 L 1200 400 L 0 400 Z'
  } else if (position === 'top') {
    viewBox = '0 0 1200 400'
    path = 'M 0 0 Q 600 400 1200 0 L 1200 0 L 0 0 Z'
  } else if (position === 'right') {
    viewBox = '0 0 400 1000'
    path = 'M 0 0 Q 400 500 0 1000 L 400 1000 L 400 0 Z'
  } else {
    viewBox = '0 0 400 1000'
    path = 'M 0 0 L 400 0 Q 0 500 400 1000 L 0 1000 Z'
  }
  return (
    <svg viewBox={viewBox} className={className} preserveAspectRatio="none" aria-hidden>
      <path d={path} fill={fill} />
    </svg>
  )
}
