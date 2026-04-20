import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap transition-all focus-visible:border-[rgba(246,182,63,0.4)] focus-visible:ring-[3px] focus-visible:ring-[rgba(246,182,63,0.16)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "border-[rgba(246,182,63,0.24)] bg-[rgba(246,182,63,0.12)] text-[#f7f0e6] [a]:hover:bg-[rgba(246,182,63,0.18)]",
        secondary:
          "border-white/10 bg-[rgba(255,255,255,0.06)] text-[#dfd2c3] [a]:hover:bg-[rgba(255,255,255,0.1)]",
        destructive:
          "border-rose-400/25 bg-rose-500/14 text-rose-100 focus-visible:ring-destructive/20 [a]:hover:bg-rose-500/20",
        outline:
          "border-white/10 bg-transparent text-[#c5b9aa] [a]:hover:bg-[rgba(255,255,255,0.06)] [a]:hover:text-[#f7f0e6]",
        ghost:
          "border-transparent bg-transparent text-[#c5b9aa] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#f7f0e6]",
        link: "border-transparent p-0 text-[#dfd2c3] underline-offset-4 hover:text-[#f7f0e6] hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
