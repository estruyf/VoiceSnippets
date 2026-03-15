import { ReactNode } from "react"

interface SettingItemProps {
  title: string
  description?: string
  children: ReactNode
}

export function SettingItem({ title, description, children }: SettingItemProps) {
  return (
    <div className="flex items-center justify-between bg-card px-4 py-3.5">
      <div>
        <span className="text-sm text-foreground">{title}</span>
        {description && (
          <p className="mt-2 mr-16 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  )
}
