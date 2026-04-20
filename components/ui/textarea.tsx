import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-28 w-full rounded-[1.35rem] border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-4 text-base leading-7 text-[#f7f0e6] transition-colors outline-none placeholder:text-[#998e82] focus-visible:border-[rgba(246,182,63,0.4)] focus-visible:ring-3 focus-visible:ring-[rgba(246,182,63,0.16)] disabled:cursor-not-allowed disabled:bg-white/5 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
