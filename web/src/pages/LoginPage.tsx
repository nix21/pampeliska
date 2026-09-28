import { Logo } from '../components/Logo'
import { Button, Callout } from '../components/ui'

export default function LoginPage() {
  const params = new URLSearchParams(location.search)
  const error = params.get('error')
  const returnUrl = location.pathname + location.search.replace(/[?&]error=[^&]*/, '')
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{
        width: 'min(420px, 100%)', display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', textAlign: 'center',
        padding: '40px 28px', background: 'var(--surface)', border: 'var(--card-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
      }}>
        <Logo size={64} />
        <div className="col" style={{ gap: 6, alignItems: 'center' }}>
          <h1 style={{ fontSize: 32 }}>Pampeliška</h1>
          <span className="muted">Rodinné finance – kam peníze odlétají.</span>
        </div>
        {error === 'forbidden' && (
          <Callout tone="danger">Tento Google účet do domácnosti nepatří. Požádej člena domácnosti, ať tvůj e-mail přidá v Členech.</Callout>
        )}
        {error === 'login' && <Callout tone="danger">Přihlášení se nepovedlo, zkus to prosím znovu.</Callout>}
        <Button variant="primary" size="lg" block onClick={() => (location.href = `/auth/login?returnUrl=${encodeURIComponent(returnUrl || '/')}`)}>
          Přihlásit přes Google
        </Button>
      </div>
    </div>
  )
}
