/** Obecný uzel grafu (kategorie, skupina…). Barva je libovolná CSS barva (var(--c1), color-mix…). */
export interface ChartNode {
  id: string | number
  label: string
  value: number
  color: string
  children?: ChartNode[]
  /** Text tooltipu; jinak popisek + hodnota. */
  title?: string
  /** Nejde na něj kliknout (pseudo-uzel). */
  disabled?: boolean
}
