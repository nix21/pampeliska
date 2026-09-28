/** Pampeliška – chmýří (13 paprsků s tečkami), žluté jádro a odlétající semínko. Převzato z prototypu. */
export function Logo({ size = 30 }: { size?: number }) {
  const c = 16
  const n = 13
  const rays = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + 0.2
    return {
      x1: c + Math.cos(a) * 4.2, y1: c + Math.sin(a) * 4.2, x2: c + Math.cos(a) * 11, y2: c + Math.sin(a) * 11,
      cx: c + Math.cos(a) * 12.6, cy: c + Math.sin(a) * 12.6,
    }
  })
  return (
    <svg width={size} height={size} viewBox="0 0 34 32" style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      {rays.map((r, i) => (
        <g key={i}>
          <line x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
          <circle cx={r.cx} cy={r.cy} r={1.5} fill="currentColor" />
        </g>
      ))}
      <circle cx={c} cy={c} r={3.4} style={{ fill: 'var(--logo-core)' }} />
      <g transform="translate(30 3) rotate(35)">
        <line x1={0} y1={0} x2={0} y2={5} stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
        <circle cx={0} cy={-1} r={1.5} fill="currentColor" />
      </g>
    </svg>
  )
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Logo size={size + 8} />
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--display-weight)' as never, letterSpacing: 'var(--display-tracking)', fontSize: size }}>
        Pampeliška
      </span>
    </span>
  )
}
