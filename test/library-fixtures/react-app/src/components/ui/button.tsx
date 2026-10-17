import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva('inline-flex items-center rounded-md text-sm', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground',
      outline: 'border bg-background',
      ghost: 'hover:bg-accent',
    },
    size: { default: 'h-9 px-4', sm: 'h-8 px-3', icon: 'size-9' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp data-slot='button' className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

function UnusedThing() {
  return <span className='never-rendered' />
}

export { Button, UnusedThing, buttonVariants }
