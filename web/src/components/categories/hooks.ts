import { useEffect, useState } from 'react'

const MOBILE = '(max-width: 767px)'

/** Mobilní rozložení (≤ 767 px) – seznam a detail jako samostatné pohledy. */
export function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(MOBILE).matches)
  useEffect(() => {
    const mq = matchMedia(MOBILE)
    const l = () => setMobile(mq.matches)
    mq.addEventListener('change', l)
    return () => mq.removeEventListener('change', l)
  }, [])
  return mobile
}

/** Hodnota zpožděná o `ms` (živý test pravidla, ukládání při psaní). */
export function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const norm = (x: string) => x.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Hledání bez ohledu na diakritiku a velikost písmen. */
export const matchesText = (haystack: string, q: string) => norm(haystack).includes(norm(q.trim()))
