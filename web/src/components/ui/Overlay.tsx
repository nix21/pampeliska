import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as Menu from '@radix-ui/react-dropdown-menu'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import clsx from 'clsx'
import { X } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { IconButton } from './Button'
import s from './ui.module.css'

export function Dialog({ open, onOpenChange, title, description, children, footer, wide, trigger }: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  trigger?: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={s.overlay} />
        <DialogPrimitive.Content className={clsx(s.dialog, wide && s.dialogWide)} aria-describedby={description ? undefined : undefined}>
          <div className={s.dialogHead}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <DialogPrimitive.Title className={s.dialogTitle}>{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className={s.dialogDesc}>{description}</DialogPrimitive.Description>
                : <DialogPrimitive.Description className="sr-only">{typeof title === 'string' ? title : ''}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton label="Zavřít" plain><X size={18} /></IconButton>
            </DialogPrimitive.Close>
          </div>
          <div className={s.dialogBody}>{children}</div>
          {footer && <div className={s.dialogFoot}>{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
export const DialogClose = DialogPrimitive.Close

export function Popover({ trigger, children, open, onOpenChange, align = 'start', width, style }: {
  trigger: ReactNode
  children: ReactNode
  open?: boolean
  onOpenChange?: (o: boolean) => void
  align?: 'start' | 'center' | 'end'
  width?: number
  style?: CSSProperties
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className={s.popover} align={align} sideOffset={6} collisionPadding={12} style={{ width, ...style }}>
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
export const PopoverClose = PopoverPrimitive.Close

export interface MenuItemDef {
  label: ReactNode
  onSelect?: () => void
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  separator?: boolean
}

export function DropdownMenu({ trigger, items, align = 'end' }: { trigger: ReactNode; items: MenuItemDef[]; align?: 'start' | 'end' }) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={s.menu} align={align} sideOffset={6} collisionPadding={12}>
          {items.map((it, i) =>
            it.separator ? <Menu.Separator key={i} className={s.menuSep} /> : (
              <Menu.Item key={i} className={clsx(s.menuItem, it.danger && s.menuItemDanger)} disabled={it.disabled} onSelect={it.onSelect}>
                {it.icon}
                {it.label}
              </Menu.Item>
            ),
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!content) return <>{children}</>
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className={s.tooltip} side={side} sideOffset={6} collisionPadding={8}>{content}</TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
export const TooltipProvider = TooltipPrimitive.Provider
