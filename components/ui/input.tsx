import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-2 text-base text-[#f7f0e6] transition-colors outline-none file:inline-flex file:h-7 file:rounded-full file:border-0 file:bg-[rgba(246,182,63,0.18)] file:px-3 file:text-sm file:font-semibold file:text-[#f7f0e6] placeholder:text-[#998e82] focus-visible:border-[rgba(246,182,63,0.4)] focus-visible:ring-3 focus-visible:ring-[rgba(246,182,63,0.16)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-white/5 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
