import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  ChevronLeft, Eye, EyeOff, Inbox, Layers, LayoutGrid, List, Menu, Moon, PieChart, Plus, Repeat, Scissors, SlidersHorizontal,
  Sun, Target, TrendingUp, Users, Wallet, Wand2, Workflow, type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { count } from '../lib/format'
import { useUi } from '../state/ui'
import { Logo, Wordmark } from './Logo'
import s from './shell.module.css'
import { Avatar, IconButton } from './ui'

export interface Badges {
  inbox: number
  batches: number
  recurringAlerts: number
}

interface NavDef {
  to: string
  label: string
  icon: LucideIcon
  group?: string
  badge?: keyof Badges
  danger?: boolean
}

/** Navigace podle prototypu. Obrazovky, které ještě nejsou hotové, se nezobrazují (viz ENABLED). */
export const NAV: NavDef[] = [
  { to: '/', label: 'Přehled', icon: LayoutGrid },
  { to: '/ucty', label: 'Účty', icon: Wallet },
  { to: '/pohyby', label: 'Pohyby', icon: List },
  { to: '/vydaje', label: 'Výdaje', icon: PieChart },
  { to: '/trideni', label: 'Ke kategorizaci', icon: Inbox, group: 'Třídění', badge: 'inbox' },
  { to: '/davky', label: 'Dávky', icon: Layers, badge: 'batches' },
  { to: '/kategorie', label: 'Kategorie', icon: Workflow },
  { to: '/pravidla', label: 'Pravidla', icon: Wand2 },
  { to: '/pravidelne', label: 'Pravidelné platby', icon: Repeat, group: 'Plánování', badge: 'recurringAlerts', danger: true },
  { to: '/rozpocty', label: 'Rozpočty', icon: Target },
  { to: '/usetrit', label: 'Kde ušetřit', icon: Scissors },
  { to: '/investice', label: 'Investice a jmění', icon: TrendingUp, group: 'Majetek' },
  { to: '/clenove', label: 'Členové', icon: Users, group: 'Domácnost' },
  { to: '/nastaveni', label: 'Nastavení', icon: SlidersHorizontal },
]

/** Hotové obrazovky (přibývají s milníky). */
export const ENABLED = new Set<string>(['/ucty', '/clenove', '/nastaveni'])

export const navItems = () => NAV.filter((n) => ENABLED.has(n.to))

export function useBadges() {
  return useQuery({ queryKey: ['badges'], queryFn: () => api.get<Badges>('/api/badges'), refetchInterval: 60_000, retry: false })
}

export function AppShell({ children }: { children: ReactNode }) {
  const { household } = useUi()
  const badges = useBadges().data
  const items = navItems()
  return (
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <Link to="/" className={s.brand}><Wordmark /></Link>
        <nav className={s.nav} aria-label="Hlavní navigace">
          {items.map((n, i) => {
            const prevGroup = items.slice(0, i).reverse().find((x) => x.group)?.group
            const groupHeading = n.group ?? (i > 0 ? undefined : undefined)
            const b = n.badge && badges ? badges[n.badge] : 0
            return (
              <div key={n.to} style={{ display: 'contents' }}>
                {groupHeading && groupHeading !== prevGroup && <div className={s.navGroup}>{groupHeading}</div>}
                <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => clsx(s.navItem, isActive && s.navItemActive)}>
                  <n.icon size={18} strokeWidth={1.75} />
                  <span>{n.label}</span>
                  {b > 0 && <span className={clsx(s.badge, n.danger && s.badgeDanger)}>{b}</span>}
                </NavLink>
              </div>
            )
          })}
        </nav>
        <div className={s.foot}>
          <div className={s.avatars}>
            {household.members.slice(0, 4).map((m) => <Avatar key={m.id} name={m.name} color={m.colorToken} ring />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span className="ellipsis" style={{ fontSize: 13, fontWeight: 600 }}>{household.name}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
              {count(household.members.length, 'člen', 'členové', 'členů')} · {count(household.accountCount, 'účet', 'účty', 'účtů')}
            </span>
          </div>
        </div>
      </aside>
      <main className={s.main}>{children}</main>
      <MobileNav badges={badges} />
    </div>
  )
}

function MobileNav({ badges }: { badges?: Badges }) {
  const item = (to: string, label: string, Icon: LucideIcon) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => clsx(s.bottomItem, isActive && s.bottomItemActive)}>
      <Icon size={22} strokeWidth={1.75} />
      {label}
    </NavLink>
  )
  const inbox = badges?.inbox ?? 0
  return (
    <nav className={s.bottomNav} aria-label="Navigace">
      {item('/', 'Přehled', LayoutGrid)}
      {item('/pohyby', 'Pohyby', List)}
      <NavLink to="/trideni" className={s.bottomItem} aria-label="Ke kategorizaci">
        <span className={s.bottomPlus}>
          <Plus size={24} strokeWidth={2.25} />
          {inbox > 0 && <span className={s.bottomBadge}>{inbox}</span>}
        </span>
      </NavLink>
      {item('/rozpocty', 'Rozpočty', Target)}
      {item('/vice', 'Více', Menu)}
    </nav>
  )
}

/** Hlavička stránky: nadpis, podtitulek, akce vpravo, přepínače režimu a skrytí částek, druhý řádek s filtry. */
export function PageHeader({ title, subtitle, actions, tools, back }: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  tools?: ReactNode
  back?: string
}) {
  const nav = useNavigate()
  return (
    <header className={s.header}>
      <div className={s.headerTop}>
        {back && (
          <IconButton label="Zpět" plain className={s.back} onClick={() => nav(back)}><ChevronLeft size={22} /></IconButton>
        )}
        <Link to="/" className="onlyMobile" style={{ display: 'flex', color: 'var(--ink)' }} aria-label="Přehled"><Logo size={26} /></Link>
        <div className={s.headerTitle}>
          <h1>{title}</h1>
          {subtitle && <span className={clsx(s.headerSub, s.hideMobile)}>{subtitle}</span>}
        </div>
        {actions && <div className={clsx('row', s.hideMobile)} style={{ gap: 8 }}>{actions}</div>}
        <ModeToggles />
      </div>
      {tools && <div className={s.headerTools}>{tools}</div>}
      {actions && <div className="onlyMobile row wrap" style={{ gap: 8 }}>{actions}</div>}
    </header>
  )
}

export function ModeToggles() {
  const { mode, toggleMode, hidden, toggleHidden } = useUi()
  return (
    <>
      <IconButton label="Světlý / tmavý režim" onClick={toggleMode}>{mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</IconButton>
      <IconButton label={hidden ? 'Zobrazit částky' : 'Skrýt částky'} active={hidden} onClick={toggleHidden}>
        {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
      </IconButton>
    </>
  )
}

export { s as shellStyles }
