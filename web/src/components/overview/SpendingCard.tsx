import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { useCategories, needShort } from '../../lib/categories'
import { count, pct } from '../../lib/format'
import { buildExpenseTree, compareShort, deltaPct, spentHeading, type OverviewStats } from '../../lib/stats'
import { useUi } from '../../state/ui'
import { Sunburst, Treemap, type ChartNode } from '../charts'
import { useMoney } from '../common'
import { Card, Segmented } from '../ui'
import { BackLink, Label, MoreLink, RingCenter, SectionHead, Swatch } from './parts'
import { childColor, drilledTiles, expenseDeltaColor, formatDelta, ringNodes, tileNodes, topColor, type ColorMode } from './spending'
import s from './overview.module.css'

const COLOR_OPTS = [{ value: 'cat' as const, label: 'Kategorie' }, { value: 'need' as const, label: 'Nezbytné / radost' }]
const VIEW_OPTS = [{ value: 'ring' as const, label: 'Prstenec' }, { value: 'tree' as const, label: 'Treemap' }]

/** „Kam peníze odlétají“ – prstenec nebo treemap výdajů podle kategorií s legendou a rozpadem kategorie. */
export function SpendingCard({ stats, mobile, className }: { stats?: OverviewStats; mobile?: boolean; className?: string }) {
  const cats = useCategories()
  const { period, compare, household } = useUi()
  const money = useMoney()
  const [mode, setMode] = useState<ColorMode>('cat')
  const [view, setView] = useState<'ring' | 'tree'>(household.settings.mainChart === 'Treemap' ? 'tree' : 'ring')
  const [sel, setSel] = useState<number | null>(null)
  const [hover, setHover] = useState<{ node: ChartNode; parent?: ChartNode } | null>(null)

  const tops = useMemo(() => (stats ? buildExpenseTree(cats, stats.byCategory).filter((t) => t.amount > 0) : []), [cats, stats])
  const total = tops.reduce((a, t) => a + t.amount, 0)
  const selCat = tops.find((t) => t.id === sel)
  const cmp = compareShort(period)

  const center = hover
    ? { title: hover.node.label, value: money(hover.node.value), sub: `${pct((hover.node.value / (total || 1)) * 100, 1)} výdajů` }
    : selCat
      ? { title: selCat.name, value: money(selCat.amount), sub: 'Klikni pro návrat' }
      : { title: spentHeading(period), value: money(total), sub: count(tops.length, 'kategorie', 'kategorie', 'kategorií') }

  const ring = ringNodes(selCat ? [selCat] : tops, mode)
  const hotTop = hover ? (hover.parent?.id ?? hover.node.id) : null

  const legend = selCat
    ? selCat.children.map((c, i) => ({
      key: c.id, name: c.name, value: money(c.amount), share: pct((c.amount / (selCat.amount || 1)) * 100),
      delta: needShort[c.need === 'Inherit' ? 'None' : c.need], deltaColor: 'var(--ink-3)', color: childColor(selCat, c, i, mode), dim: false,
      onClick: undefined as (() => void) | undefined, top: undefined as number | undefined,
    }))
    : tops.map((t) => {
      const d = compare ? deltaPct(t.amount, t.previous) : null
      return {
        key: t.id, name: t.name, value: money(t.amount), share: pct((t.amount / (total || 1)) * 100),
        delta: compare ? formatDelta(d) : '', deltaColor: expenseDeltaColor(d), color: topColor(t, 'cat'), dim: hotTop != null && hotTop !== t.id,
        onClick: t.children.length ? () => (setSel(t.id), setHover(null)) : undefined, top: t.id,
      }
    })

  const back = () => (setSel(null), setHover(null))
  const empty = !!stats && tops.length === 0

  const chart = empty ? (
    <div className={s.emptyChart}>V tomto období zatím nejsou žádné výdaje.</div>
  ) : view === 'ring' ? (
    <Sunburst items={ring} size={mobile ? 270 : 320} aria-label="Výdaje podle kategorií"
      onItemClick={(it) => (setSel(sel != null ? null : Number(it.id)), setHover(null))}
      onChildClick={(_, parent) => (setSel(Number(parent.id)), setHover(null))}
      onHover={(node, parent) => setHover(node ? { node, parent } : null)}
      onCenterClick={selCat ? back : undefined}
      center={<RingCenter title={center.title} value={center.value} sub={mobile ? undefined : center.sub} small={mobile} />} />
  ) : (
    <Treemap height={mobile ? 300 : 340} formatValue={(v) => money(v)} formatShare={(x) => pct(x * 100)}
      items={selCat ? drilledTiles(selCat, mode) : tileNodes(tops, mode)}
      onTileClick={selCat ? undefined : (_, group) => group && setSel(Number(group.id))} />
  )

  const legendRows = (
    <div className={s.legend}>
      {legend.map((l) => (
        <div key={l.key} role={l.onClick ? 'button' : undefined} tabIndex={l.onClick ? 0 : undefined}
          className={clsx(s.legendRow, mobile && s.legendRowMobile, l.onClick && s.clickable)} style={{ opacity: l.dim ? 0.45 : 1 }}
          onClick={l.onClick} onKeyDown={(e) => e.key === 'Enter' && l.onClick?.()}
          onMouseEnter={() => l.top != null && setHover({ node: { id: l.top, label: l.name, value: tops.find((t) => t.id === l.top)!.amount, color: l.color } })}
          onMouseLeave={() => setHover(null)}>
          <Swatch color={l.color} />
          <span className={clsx('ellipsis', s.legendName)}>{l.name}</span>
          <span className={s.legendValue}>{l.value}</span>
          {!mobile && <span className={s.legendShare}>{l.share}</span>}
          <span className={s.legendDelta} style={{ color: l.deltaColor }}>{l.delta}</span>
        </div>
      ))}
    </div>
  )

  if (mobile) {
    return (
      <Card className={className}>
        <div className="row">
          <h2 style={{ flex: 1 }}>Kam peníze odlétají</h2>
          <Segmented size="sm" value={view} onChange={(v) => (setView(v), setHover(null))} options={VIEW_OPTS} />
        </div>
        <Segmented full value={mode} onChange={setMode} options={COLOR_OPTS} />
        <div style={{ display: 'flex', justifyContent: 'center' }}>{chart}</div>
        {selCat && <BackLink onClick={back} />}
        {legendRows}
        <MoreLink to="/vydaje" style={{ justifyContent: 'center', minHeight: 44, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', color: 'var(--ink)' }}>
          Detail a platby
        </MoreLink>
      </Card>
    )
  }

  return (
    <Card className={className} style={{ gap: 16 }}>
      <SectionHead title="Kam peníze odlétají" size={22}>
        <span style={{ flex: 1 }} />
        <Segmented size="sm" value={mode} onChange={setMode} options={COLOR_OPTS} />
        <Segmented size="sm" value={view} onChange={(v) => (setView(v), setHover(null))} options={VIEW_OPTS} />
        <MoreLink to="/vydaje">Detail a platby</MoreLink>
      </SectionHead>
      {view === 'ring' ? (
        <div className={s.ringLayout}>
          {chart}
          <div className={s.ringLegend}>
            <div className={s.legendHead}>
              {selCat && <BackLink onClick={back} />}
              <Label faint style={{ marginLeft: 'auto' }}>{selCat ? 'Podkategorie' : compare ? `Podíl · ${cmp}` : 'Podíl'}</Label>
            </div>
            {legendRows}
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          <div className={s.treeInfo}>
            {selCat ? <BackLink onClick={back} /> : <span className="faint" style={{ fontSize: 12 }}>Plocha dlaždice odpovídá částce · klikněte pro rozpad kategorie</span>}
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>{center.title}</span>
              <span className="num" style={{ fontSize: 15, fontWeight: 700 }}>{center.value}</span>
            </span>
          </div>
          {chart}
        </div>
      )}
    </Card>
  )
}
