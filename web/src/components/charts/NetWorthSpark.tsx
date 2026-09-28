/** Spojnice vývoje (čisté jmění): škáluje mezi min a max, barva podle trendu. */
export function NetWorthSpark({ values, width = 110, height = 30, color }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <span style={{ width, height, display: 'inline-block' }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const d = values
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * width).toFixed(1)} ${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`)
    .join('')
  const up = values[values.length - 1] >= values[0]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }} aria-hidden>
      <path d={d} fill="none" stroke={color ?? (up ? 'var(--pos)' : 'var(--neg)')} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
