import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Search, Sparkles, Store, Trash2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, notifyError, notifyOk } from '../../lib/api'
import { count, relative } from '../../lib/format'
import { NOTE_MAX, notesQuery, type NoteDto, type NoteInput } from '../../lib/rules'
import { PageHeader } from '../AppShell'
import { CategoryChip, CategoryPicker } from '../category'
import { matchesText } from '../categories/hooks'
import { Button, Callout, Card, Dialog, Empty, Field, IconButton, Segmented, Spinner, Textarea, TextInput } from '../ui'
import s from './NotesTab.module.css'

export type RulesTab = 'rules' | 'notes'

/** Přepínač Pravidla | Poznámky pro AI (?tab=notes). */
export function RulesTabs() {
  const [params, setParams] = useSearchParams()
  const tab: RulesTab = params.get('tab') === 'notes' ? 'notes' : 'rules'
  return (
    <Segmented<RulesTab> aria-label="Pravidla nebo poznámky" value={tab} className={s.tabs}
      options={[{ value: 'rules', label: 'Pravidla' }, { value: 'notes', label: 'Poznámky pro AI' }]}
      onChange={(v) => setParams(v === 'notes' ? { tab: 'notes' } : {}, { replace: true })} />
  )
}

/** Záložka Poznámky pro AI: sdílená paměť MCP klientů ke kategorizaci – přehled, úpravy, mazání. */
export function NotesTab() {
  const notesQ = useQuery(notesQuery)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<NoteDto | 'new' | null>(null)
  const [deleting, setDeleting] = useState<NoteDto | null>(null)
  const qc = useQueryClient()
  const notes = notesQ.data ?? []
  const visible = notes.filter((n) => !q.trim() || matchesText(`${n.text} ${n.merchantPattern ?? ''} ${n.categoryPath ?? ''}`, q))

  const del = useMutation({
    mutationFn: (n: NoteDto) => api.del(`/api/notes/${n.id}`),
    onSuccess: () => {
      notifyOk('Poznámka smazána')
      setDeleting(null)
      return qc.invalidateQueries({ queryKey: notesQuery.queryKey })
    },
    onError: notifyError,
  })

  return (
    <>
      <PageHeader
        title="Pravidla"
        subtitle={`${count(notes.length, 'poznámka', 'poznámky', 'poznámek')} · co si AI pamatuje o zatřiďování`}
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>Nová poznámka</Button>}
        tools={
          <>
            <RulesTabs />
            <label className={s.search}>
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat v poznámkách" aria-label="Hledat v poznámkách" />
              {q && <button type="button" onClick={() => setQ('')} aria-label="Vymazat"><X size={14} /></button>}
            </label>
          </>
        }
      />

      <Callout icon={<Sparkles size={16} />}>
        Poznámky si ukládá AI přes MCP (nebo je napíšeš sám) a čte si je při každé kategorizaci – ať se připojí kdokoli z domácnosti a z jakékoli
        aplikace. Hodí se na výjimky a souvislosti, které pravidlo nezachytí. Chybnou poznámku oprav nebo smaž.
      </Callout>

      {notesQ.isLoading ? <Spinner center /> : (
        <div className={s.list}>
          {visible.length === 0 && (
            <Card>
              {notes.length > 0
                ? <Empty title="Nic nenalezeno">Zkus jiný hledaný text.</Empty>
                : <Empty title="Zatím žádné poznámky">
                    Až AI při zatřiďování zjistí něco, co se nedá vyjádřit pravidlem (třeba „platby od Jany K. jsou kapesné“), uloží si to sem.
                  </Empty>}
            </Card>
          )}
          {visible.map((n) => (
            <NoteCard key={n.id} note={n} onEdit={() => setEditing(n)} onDelete={() => setDeleting(n)} />
          ))}
        </div>
      )}

      {editing && <NoteDialog note={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Smazat poznámku?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Zrušit</Button>
            <Button variant="danger" loading={del.isPending} onClick={() => deleting && del.mutate(deleting)}>Smazat</Button>
          </>
        }>
        <span className={s.quote}>{deleting?.text}</span>
      </Dialog>
    </>
  )
}

function NoteCard({ note: n, onEdit, onDelete }: { note: NoteDto; onEdit: () => void; onDelete: () => void }) {
  const edited = n.updatedBy && n.updatedAt !== n.createdAt
  return (
    <Card className={s.card}>
      <div className={s.body}>
        <p className={s.text}>{n.text}</p>
        {(n.merchantPattern || n.categoryId != null) && (
          <div className={s.links}>
            {n.merchantPattern && <span className={s.merchant}><Store size={12} /> <span className="faint">Obchodník obsahuje</span> <b>{n.merchantPattern}</b></span>}
            {n.categoryId != null && <CategoryChip id={n.categoryId} />}
          </div>
        )}
        <span className={s.meta}>
          {n.createdBy} · {relative(n.createdAt)}
          {edited && <> · upravil(a) {n.updatedBy} {relative(n.updatedAt)}</>}
        </span>
      </div>
      <div className={s.actions}>
        <IconButton label="Upravit poznámku" onClick={onEdit}><Pencil size={16} /></IconButton>
        <IconButton label="Smazat poznámku" onClick={onDelete}><Trash2 size={16} /></IconButton>
      </div>
    </Card>
  )
}

function NoteDialog({ note, onClose }: { note?: NoteDto; onClose: () => void }) {
  const qc = useQueryClient()
  const [text, setText] = useState(note?.text ?? '')
  const [merchant, setMerchant] = useState(note?.merchantPattern ?? '')
  const [categoryId, setCategoryId] = useState<number | null>(note?.categoryId ?? null)
  const save = useMutation({
    mutationFn: () => {
      const body: NoteInput = { text: text.trim(), merchantPattern: merchant.trim() || null, categoryId }
      return note ? api.put(`/api/notes/${note.id}`, body) : api.post('/api/notes', body)
    },
    onSuccess: () => {
      notifyOk(note ? 'Poznámka uložena' : 'Poznámka přidána')
      onClose()
      return qc.invalidateQueries({ queryKey: notesQuery.queryKey })
    },
    onError: notifyError,
  })
  const tooLong = text.trim().length > NOTE_MAX
  const label = (t: ReactNode, hint?: string) => <span className={s.label}>{t}{hint && <span className="faint"> · {hint}</span>}</span>

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={note ? 'Upravit poznámku' : 'Nová poznámka'}
      description="AI si ji přečte při každé kategorizaci."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Zrušit</Button>
          <Button variant="primary" className="grow" disabled={!text.trim() || tooLong} loading={save.isPending} onClick={() => save.mutate()}>
            {note ? 'Uložit' : 'Přidat poznámku'}
          </Button>
        </>
      }>
      <Field label={label('Poznámka')} error={tooLong ? `Max ${NOTE_MAX} znaků` : undefined} hint={`${text.trim().length} / ${NOTE_MAX}`}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus
          placeholder="Např. Platby od Jany K. jsou kapesné pro dceru – patří do Děti › Kapesné." />
      </Field>
      <Field label={label('Obchodník', 'volitelné')} hint="Poznámka se ukáže AI u plateb, jejichž text obsahuje tento výraz.">
        <TextInput value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Např. Alza" maxLength={100} />
      </Field>
      <div className={s.field}>
        {label('Kategorie', 'volitelné')}
        <div className={s.catRow}>
          <CategoryPicker value={categoryId} onChange={setCategoryId} placeholder="Bez kategorie" block />
          {categoryId != null && <IconButton label="Bez kategorie" onClick={() => setCategoryId(null)}><X size={16} /></IconButton>}
        </div>
        <span className={s.hint}>Ukáže se u plateb navržených do této kategorie nebo jejích podkategorií.</span>
      </div>
    </Dialog>
  )
}
