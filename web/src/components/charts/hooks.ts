import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from 'react'

/** Šířka prvku v px (ResizeObserver). */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 600) {
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth || fallback)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, fallback])
  return width
}

/** matchMedia jako hook. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof matchMedia === 'undefined') return () => {}
      const mq = matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => (typeof matchMedia === 'undefined' ? false : matchMedia(query).matches),
    () => false,
  )
}

/** Mobil podle breakpointu 767 px. */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)')
