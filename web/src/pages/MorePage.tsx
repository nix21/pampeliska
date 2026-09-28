import { ChevronRight, LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import { navItems, PageHeader, useBadges } from '../components/AppShell'
import { Card } from '../components/ui'
import { api } from '../lib/api'

/** Mobil: všechny obrazovky, které se nevešly do spodní lišty. */
export default function MorePage() {
  const badges = useBadges().data
  const items = navItems()
  return (
    <>
      <PageHeader title="Více" />
      <Card pad={false}>
        {items.map((n, i) => {
          const b = n.badge && badges ? badges[n.badge] : 0
          return (
            <Link key={n.to} to={n.to} style={{
              display: 'flex', alignItems: 'center', gap: 12, minHeight: 54, padding: '0 16px', textDecoration: 'none',
              borderTop: i ? '1px solid var(--line)' : undefined, fontSize: 15, fontWeight: 600,
            }}>
              <n.icon size={20} color="var(--ink-2)" />
              <span style={{ flex: 1 }}>{n.label}</span>
              {b > 0 && <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: 'var(--accent)' }}>{b}</span>}
              <ChevronRight size={18} color="var(--ink-3)" />
            </Link>
          )
        })}
      </Card>
      <button type="button" onClick={async () => { await api.post('/auth/logout'); location.href = '/' }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, border: 0, background: 'transparent', color: 'var(--ink-2)', fontWeight: 600 }}>
        <LogOut size={18} /> Odhlásit
      </button>
    </>
  )
}
