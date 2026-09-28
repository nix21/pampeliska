import { Check, Inbox, Upload, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ImportHelpButton } from '../ImportHelp'
import { Logo } from '../Logo'
import { Card } from '../ui'
import s from './overview.module.css'

const STEPS = [
  { icon: Wallet, title: 'Účty a kategorie', text: 'Domácnost, účty i strom kategorií jsou nastavené.', done: true },
  { icon: Upload, title: 'Nahraj první výpis', text: 'Předej výpis Claudovi – pohyby pošle přes MCP do nové dávky a navrhne kategorie.', done: false },
  { icon: Inbox, title: 'Potvrď zařazení', text: 'V „Ke kategorizaci“ jen zkontroluješ návrhy. Pak se tu objeví přehled.', done: false },
]

/** Přehled bez jediného pohybu: „Pampeliška je připravená. Teď potřebuje první pohyby.“ */
export function EmptyDashboard() {
  return (
    <Card className={s.empty}>
      <span className={s.emptyLogo}><Logo size={56} /></span>
      <div className="col" style={{ gap: 8, alignItems: 'center', textAlign: 'center' }}>
        <h2 className={s.emptyTitle}>Pampeliška je připravená. Teď potřebuje první pohyby.</h2>
        <span className="muted" style={{ fontSize: 15, maxWidth: 520 }}>
          Jakmile nahraješ výpis z banky, uvidíš tu disponibilní zůstatek, kam peníze odlétají, rozpočty i hlídání účtů.
        </span>
      </div>
      <div className={s.emptySteps}>
        {STEPS.map((st, i) => (
          <div key={st.title} className={s.emptyStep}>
            <span className={s.emptyStepIcon} style={st.done ? { background: 'var(--pos)', color: '#fff' } : undefined}>
              {st.done ? <Check size={16} strokeWidth={3} /> : i + 1}
            </span>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{st.title}</span>
              <span className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{st.text}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="row wrap" style={{ justifyContent: 'center', gap: 10 }}>
        <ImportHelpButton variant="primary" size="lg">Nahrát výpis</ImportHelpButton>
        <Link to="/ucty" className={s.emptySecondary}>Zkontrolovat účty</Link>
      </div>
    </Card>
  )
}
