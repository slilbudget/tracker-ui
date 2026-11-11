import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, CircleXIcon, InfoIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon strokeWidth={2} className="size-4" />
        ),
        info: (
          <InfoIcon strokeWidth={2} className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon strokeWidth={2} className="size-4" />
        ),
        error: (
          <CircleXIcon strokeWidth={2} className="size-4" />
        ),
        loading: (
          <LoaderCircleIcon strokeWidth={2} className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast !shadow-none",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
