import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as RadioGroup from '@radix-ui/react-radio-group'
import * as SelectPrimitive from '@radix-ui/react-select'
import * as SliderPrimitive from '@radix-ui/react-slider'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import clsx from 'clsx'
import { Check, ChevronDown, Minus } from 'lucide-react'
import { forwardRef, useEffect, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { dateLong, num, parseAmount, parseDateInput } from '../../lib/format'
import s from './ui.module.css'

export function Field({ label, hint, error, children, className }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx(s.field, className)}>
      {label}
      {children}
      {error ? <span className={s.fieldError}>{error}</span> : hint ? <span className={s.fieldHint}>{hint}</span> : null}
    </label>
  )
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { suffix?: ReactNode; prefix?: ReactNode }>(
  function TextInput({ className, suffix, prefix, ...rest }, ref) {
    if (!suffix && !prefix) return <input ref={ref} className={clsx(s.input, className)} {...rest} />
    return (
      <span className={clsx(s.inputWrap, prefix && s.inputWithPrefix)}>
        {prefix && <span className={s.inputPrefix}>{prefix}</span>}
        <input ref={ref} className={clsx(s.input, className)} {...rest} />
        {suffix && <span className={s.inputSuffix}>{suffix}</span>}
      </span>
    )
  },
)

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(s.textarea, className)} {...rest} />
}

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | null | undefined
  onChange: (v: number | null) => void
  suffix?: ReactNode
  decimals?: number
}

/** Číselný vstup s formátem cs-CZ (mezery po tisících, desetinná čárka). */
export function NumberInput({ value, onChange, suffix, decimals = 2, className, ...rest }: NumberInputProps) {
  const fmt = (v: number | null | undefined) => (v == null ? '' : num(v, Number.isInteger(v) ? 0 : decimals))
  const [text, setText] = useState(fmt(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(fmt(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused])
  return (
    <TextInput
      inputMode="decimal"
      className={clsx(s.numberInput, className)}
      value={text}
      suffix={suffix}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        setText(fmt(value))
      }}
      onChange={(e) => {
        setText(e.target.value)
        onChange(parseAmount(e.target.value))
      }}
      {...rest}
    />
  )
}

/** Datum jako text („28. 9. 2026“), hodnota ISO. */
export function DateInput({ value, onChange, ...rest }: { value: string | null; onChange: (iso: string | null) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value ? dateLong(value) : '')
  useEffect(() => setText(value ? dateLong(value) : ''), [value])
  const valid = text === '' || parseDateInput(text) != null
  return (
    <TextInput
      value={text}
      placeholder="d. m. rrrr"
      style={valid ? undefined : { borderColor: 'var(--neg)' }}
      onChange={(e) => {
        setText(e.target.value)
        const iso = parseDateInput(e.target.value)
        if (iso || e.target.value === '') onChange(iso)
      }}
      {...rest}
    />
  )
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <SwitchPrimitive.Root className={s.switch} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label}>
      <SwitchPrimitive.Thumb className={s.switchThumb} />
    </SwitchPrimitive.Root>
  )
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean | 'indeterminate'; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <CheckboxPrimitive.Root className={s.checkbox} checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-label={label} disabled={disabled}
      onClick={(e) => e.stopPropagation()}>
      <CheckboxPrimitive.Indicator>{checked === 'indeterminate' ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}</CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export interface RadioCardOption<T extends string> {
  value: T
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  disabled?: boolean
}

/** Volba z karet (Typ účtu, Odkud chodí pohyby …). */
export function RadioCards<T extends string>({ options, value, onChange, columns = 1 }: { options: RadioCardOption<T>[]; value: T; onChange: (v: T) => void; columns?: number }) {
  return (
    <RadioGroup.Root value={value} onValueChange={(v) => onChange(v as T)}
      style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${columns > 1 ? 180 : 260}px), 1fr))`, gap: 10 }}>
      {options.map((o) => (
        <RadioGroup.Item key={o.value} value={o.value} disabled={o.disabled} className={s.radioCard} style={o.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
          {o.icon && <span style={{ display: 'flex', color: 'var(--ink-2)', marginTop: 1 }}>{o.icon}</span>}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{o.title}</span>
            {o.description && <span style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45 }}>{o.description}</span>}
          </span>
          <span className={s.radioDot} />
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}

export interface SelectOption {
  value: string
  label: ReactNode
  group?: string
  disabled?: boolean
  prefix?: ReactNode
}

export function Select({ value, onChange, options, placeholder, size, 'aria-label': ariaLabel, className }: {
  value: string | null
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  size?: 'sm' | 'md'
  'aria-label'?: string
  className?: string
}) {
  const groups = [...new Set(options.map((o) => o.group ?? ''))]
  return (
    <SelectPrimitive.Root value={value ?? undefined} onValueChange={onChange}>
      <SelectPrimitive.Trigger className={clsx(s.selectTrigger, size === 'sm' && s.selectTriggerSm, className)} aria-label={ariaLabel}>
        <span className="ellipsis" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon><ChevronDown size={16} /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className={s.selectContent} position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport className={s.selectViewport}>
            {groups.map((g) => (
              <SelectPrimitive.Group key={g}>
                {g && <SelectPrimitive.Label className={s.selectGroupLabel}>{g}</SelectPrimitive.Label>}
                {options.filter((o) => (o.group ?? '') === g).map((o) => (
                  <SelectPrimitive.Item key={o.value} value={o.value} disabled={o.disabled} className={s.selectItem}>
                    <SelectPrimitive.ItemIndicator className={s.selectIndicator}><Check size={14} /></SelectPrimitive.ItemIndicator>
                    {o.prefix}
                    <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label?: string }) {
  return (
    <SliderPrimitive.Root className={s.slider} value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} aria-label={label}>
      <SliderPrimitive.Track className={s.sliderTrack}><SliderPrimitive.Range className={s.sliderRange} /></SliderPrimitive.Track>
      <SliderPrimitive.Thumb className={s.sliderThumb} aria-label={label} />
    </SliderPrimitive.Root>
  )
}
