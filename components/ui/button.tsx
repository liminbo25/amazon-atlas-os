import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap text-[#f7f0e6] transition-all outline-none select-none focus-visible:border-[rgba(246,182,63,0.4)] focus-visible:ring-3 focus-visible:ring-[rgba(246,182,63,0.16)] active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-[rgba(246,182,63,0.28)] bg-[rgba(246,182,63,0.16)] text-[#f7f0e6] [a]:hover:bg-[rgba(246,182,63,0.24)]",
        outline:
          "border-white/10 bg-[rgba(255,255,255,0.04)] text-[#f7f0e6] hover:bg-[rgba(255,255,255,0.08)] aria-expanded:bg-[rgba(255,255,255,0.08)] aria-expanded:text-[#f7f0e6]",
        secondary:
          "border-white/8 bg-[rgba(255,255,255,0.06)] text-[#dfd2c3] hover:bg-[rgba(255,255,255,0.1)] aria-expanded:bg-[rgba(255,255,255,0.1)] aria-expanded:text-[#f7f0e6]",
        ghost:
          "border-transparent bg-transparent text-[#c5b9aa] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#f7f0e6] aria-expanded:bg-[rgba(255,255,255,0.06)] aria-expanded:text-[#f7f0e6]",
        destructive:
          "border-rose-400/25 bg-rose-500/14 text-rose-100 hover:bg-rose-500/22 focus-visible:border-rose-400/40 focus-visible:ring-rose-500/20",
        link: "border-transparent p-0 text-[#dfd2c3] underline-offset-4 hover:text-[#f7f0e6] hover:underline",
      },
      size: {
        default:
          "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-full px-2.5 text-xs in-data-[slot=button-group]:rounded-full has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-full px-3 text-[0.8rem] in-data-[slot=button-group]:rounded-full has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-10",
        "icon-xs":
          "size-7 rounded-full in-data-[slot=button-group]:rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-full in-data-[slot=button-group]:rounded-full",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
