/** Výseč mezikruží (úhly od 12 hodin po směru). */
export function arcPath(c: number, r0: number, r1: number, a0: number, a1: number) {
  if (a1 - a0 >= Math.PI * 2 - 1e-4) a1 = a0 + Math.PI * 2 - 1e-3
  const p = (r: number, a: number) => [(c + r * Math.sin(a)).toFixed(2), (c - r * Math.cos(a)).toFixed(2)]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = p(r1, a0)
  const [x1, y1] = p(r1, a1)
  const [x2, y2] = p(r0, a1)
  const [x3, y3] = p(r0, a0)
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`
}
