import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { initials } from '../../lib/format'
import s from './ui.module.css'

export function Card({ children, className, style, pad = true, as: As = 'section' }: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  pad?: boolean
  as?: 'section' | 'div'
}) {
  return <As className={clsx(s.card, pad && s.cardPad, className)} style={style}>{children}</As>
}

export function CardHeader({ title, link, linkTo, onLink, right, sub }: {
  title: ReactNode
  link?: ReactNode
  linkTo?: string
  onLink?: () => void
  right?: ReactNode
  sub?: ReactNode
}) {
  return (
    <div className={s.cardHead}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <h2 className={s.cardTitle}>{title}</h2>
        {sub && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</span>}
      </div>
      {right}
      {link && linkTo && <Link to={linkTo} className={s.cardLink}>{link}<ChevronRight size={14} /></Link>}
      {link && !linkTo && onLink && <button type="button" className={s.cardLink} onClick={onLink}>{link}<ChevronRight size={14} /></button>}
    </div>
  )
}

export type PillTone = 'neutral' | 'accent' | 'dark' | 'pos' | 'neg' | 'warn' | 'dashed'
const pillClass: Record<PillTone, string> = {
  neutral: s.pillNeutral, accent: s.pillAccent, dark: s.pillDark, pos: s.pillPos, neg: s.pillNeg, warn: s.pillWarn, dashed: s.pillDashed,
}

export function Pill({ tone = 'neutral', children, icon, style, title }: { tone?: PillTone; children: ReactNode; icon?: ReactNode; style?: CSSProperties; title?: string }) {
  return <span className={clsx(s.pill, pillClass[tone])} style={style} title={title}>{icon}{children}</span>
}

/** Kolečko s iniciálami v barvě člena (token c1…c12). */
export function Avatar({ name, color, size = 28, ring }: { name: string; color?: string; size?: number; ring?: boolean }) {
  return (
    <span className={s.avatar} title={name}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)), background: tokenColor(color ?? 'ink-3'), boxShadow: ring ? '0 0 0 2px var(--bg)' : undefined }}>
      {initials(name)}
    </span>
  )
}

/** „c3“ → „var(--c3)“; hex a var() nechá být. */
export function tokenColor(t?: string | null) {
  if (!t) return 'var(--ink-3)'
  if (t.startsWith('#') || t.startsWith('var(') || t.startsWith('color-mix')) return t
  return `var(--${t.replace(/^--/, '')})`
}

/** Jemné pozadí z barvy (ikona obchodníka, zvýrazněný řádek). */
export const tint = (color: string, pct = 16) => `color-mix(in oklch, ${tokenColor(color)} ${pct}%, var(--surface))`

export function Empty({ title, children, icon, action }: { title: ReactNode; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      {icon && <span style={{ color: 'var(--ink-3)' }}>{icon}</span>}
      <span className={s.emptyTitle}>{title}</span>
      {children && <span style={{ fontSize: 13, maxWidth: 420 }}>{children}</span>}
      {action}
    </div>
  )
}

export function Spinner({ center }: { center?: boolean }) {
  const el = <span className={s.spinner} role="status" aria-label="Načítám" />
  return center ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>{el}</div> : el
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | string; style?: CSSProperties }) {
  return <div className={s.skeleton} style={{ height, width, ...style }} />
}

export function ProgressBar({ value, color = 'var(--ink)', height = 6, marker, style }: { value: number; color?: string; height?: number; marker?: number; style?: CSSProperties }) {
  return (
    <div className={s.bar} style={{ height, ...style }}>
      <div className={s.barFill} style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      {marker != null && <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${Math.min(100, marker)}%`, width: 2, background: 'var(--ink)', borderRadius: 1 }} />}
    </div>
  )
}

export function Callout({ tone = 'info', icon, children, action }: { tone?: 'info' | 'warn' | 'danger' | 'pos' | 'neutral'; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const cls = { info: s.calloutInfo, warn: s.calloutWarn, danger: s.calloutDanger, pos: s.calloutPos, neutral: s.calloutNeutral }[tone]
  const color = { info: 'var(--ink)', warn: 'var(--warn)', danger: 'var(--neg)', pos: 'var(--pos)', neutral: 'var(--ink-2)' }[tone]
  return (
    <div className={clsx(s.callout, cls)}>
      {icon && <span style={{ display: 'flex', color, paddingTop: 1 }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {action}
    </div>
  )
}
