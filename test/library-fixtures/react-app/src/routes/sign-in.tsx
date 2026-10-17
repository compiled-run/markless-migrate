import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@/features/sign-in'

export const Route = createFileRoute('/sign-in')({ component: SignIn })
