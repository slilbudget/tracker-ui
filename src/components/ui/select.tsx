import * as React from "react"
import { cn } from "@/lib/utils"
import { Select as SelectPrimitive } from "radix-ui"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon } from "lucide-react"

// A filter on its default («Все …», value "all") is shown muted; a chosen filter stands out in the normal text colour.
const IdleCtx = React.createContext(false)

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return (
    <IdleCtx.Provider value={props.value === "all"}>
      <SelectPrimitive.Root data-slot="select" {...props} />
    </IdleCtx.Provider>
  )
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  // The chosen value can be selected with the mouse and copied (owner 16/11). Chrome never starts a text selection
  // inside a <button>, so the trigger is a focusable div (role combobox comes from Radix). Radix opens the list on
  // pointerdown, which would kill the selection: here a press only starts a selection and the list opens on click,
  // unless the press selected some text. A disabled <fieldset> (read-only forms) keeps the list closed.
  const blocked = (e: React.SyntheticEvent<HTMLElement>) => !!e.currentTarget.closest("fieldset:disabled")
  const skipRadix = (e: React.SyntheticEvent) => { (e as unknown as { defaultPrevented: boolean }).defaultPrevented = true }
  // a div has no native disabled state: the root <Select disabled> (Radix sets data-disabled) or a disabled fieldset
  // take it out of the Tab order and announce it; checked after every render, the fieldset can change any time
  const ref = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const off = el.hasAttribute("data-disabled") || !!el.closest("fieldset:disabled")
    el.tabIndex = off ? -1 : 0
    if (off) el.setAttribute("aria-disabled", "true")
    else el.removeAttribute("aria-disabled")
  })
  return (
    <SelectPrimitive.Trigger
      asChild
      {...props}
      onPointerDown={(e) => {
        props.onPointerDown?.(e)
        if ((e.pointerType === "mouse" && e.button === 0 && !e.ctrlKey) || blocked(e)) skipRadix(e)
      }}
      onClick={(e) => {
        props.onClick?.(e)
        const sel = window.getSelection()
        const selected = !!sel && !sel.isCollapsed && !!sel.toString().trim() && e.currentTarget.contains(sel.anchorNode)
        if (selected || blocked(e)) skipRadix(e)
      }}
      onKeyDown={(e) => {
        props.onKeyDown?.(e)
        if (blocked(e)) skipRadix(e)
      }}
    >
      <div
        ref={ref}
        data-slot="select-trigger"
        data-size={size}
        data-idle={React.useContext(IdleCtx) || undefined}
        className={cn(
          "flex w-fit items-center justify-between gap-1.5 rounded-md border border-input bg-input/20 py-1.5 whitespace-nowrap outline-none focus-visible:border-ring focus-visible:ring-0 cursor-default select-text data-disabled:cursor-not-allowed data-disabled:opacity-50 in-[fieldset:disabled]:cursor-not-allowed in-[fieldset:disabled]:opacity-50 *:data-[slot=select-value]:pointer-events-auto! *:data-[slot=select-value]:select-text aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-idle:text-muted-foreground data-[size=default]:h-8 data-[size=default]:px-2.5 data-[size=default]:text-sm data-[size=sm]:h-7 data-[size=sm]:px-2 data-[size=sm]:text-xs *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className
        )}
      >
        {children}
        <SelectPrimitive.Icon asChild>
          <ChevronsUpDownIcon strokeWidth={2} className="pointer-events-none size-4 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </div>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        data-align-trigger={position === "item-aligned"}
        className={cn("relative z-50 max-h-(--radix-select-content-available-height) min-w-32 overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground ring-1 ring-border", position ==="popper"&&"data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", className )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          data-position={position}
          className={cn(
            "data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)",
            position === "popper" && ""
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2.5 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-8 w-full cursor-default items-center gap-2 rounded-md px-2.5 py-1 text-sm outline-hidden select-none focus:bg-muted focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon strokeWidth={2} className="pointer-events-none text-muted-foreground" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    >
      <ChevronUpIcon strokeWidth={2} />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    >
      <ChevronDownIcon strokeWidth={2} />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
}
