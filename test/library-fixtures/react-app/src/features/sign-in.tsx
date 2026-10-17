import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'

const formSchema = z.object({
  email: z.email({ error: (iss) => (iss.input === '' ? 'Please enter your email.' : undefined) }),
  password: z.string().min(7, 'Password must be at least 7 characters long.'),
})

export function SignIn() {
  const form = useForm<z.infer<typeof formSchema>>({ resolver: zodResolver(formSchema), defaultValues: { email: '', password: '' } })
  const { register } = form
  return (
    <form onSubmit={form.handleSubmit(() => {})}>
      <input {...register('email')} />
      <p>{form.formState.errors.email?.message}</p>
      <Button>Sign in</Button>
    </form>
  )
}
