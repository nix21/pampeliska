import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import s from './overview.module.css'

/** Popisek karty („Disponibilní zůstatek“). */
export function Label({ children, faint, style }: { children: ReactNode; faint?: boolean; style?: CSSProperties }) {
  return <span className={clsx(s.label, faint && s.labelFaint)} style={style}>{children}</span>
}

/** Velké číslo (display font). */
export function BigNum({ children, size = 34, color, style }: { children: ReactNode; size?: number; color?: string; style?: CSSProperties }) {
  return <span className={s.big} style={{ fontSize: size, color, ...style }}>{children}</span>
}

/** Nadpis sekce s odkazem / akcemi vpravo. */
export function SectionHead({ title, children, size = 20 }: { title: ReactNode; children?: ReactNode; size?: number }) {
  return (
    <div className={s.sectionHead}>
      <h2 style={{ fontSize: size }}>{title}</h2>
      {children}
    </div>
  )
}

/** Malý odkaz „Detail a platby ›“. */
export function MoreLink({ to, children, chevron = true, style }: { to: string; children: ReactNode; chevron?: boolean; style?: CSSProperties }) {
  return (
    <Link to={to} className={s.more} style={style}>
      {children}
      {chevron && <ChevronRight size={16} />}
    </Link>
  )
}

/** „‹ Všechny kategorie“ */
export function BackLink({ onClick, children = 'Všechny kategorie' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" className={s.back} onClick={onClick}>
      <ChevronLeft size={16} />
      {children}
    </button>
  )
}

/** Střed prstence: nadpis, částka, podtitulek. */
export function RingCenter({ title, value, sub, small }: { title: ReactNode; value: ReactNode; sub?: ReactNode; small?: boolean }) {
  return (
    <>
      <span className={s.centerTitle}>{title}</span>
      <span className={s.centerValue} style={small ? { fontSize: 19 } : undefined}>{value}</span>
      {sub && <span className={s.centerSub}>{sub}</span>}
    </>
  )
}

/** Tečka barvy (libovolná CSS barva). */
export function Swatch({ color, size = 10 }: { color: string; size?: number }) {
  return <span className={s.swatch} style={{ width: size, height: size, background: color }} />
}

/** Štítek typu výdaje v barvě (Nezbytné / Pro radost). */
export function NeedPill({ label, color }: { label: string; color: string }) {
  return <span className={s.needPill} style={{ background: `color-mix(in oklch, ${color} 22%, var(--surface))` }}>{label}</span>
}
