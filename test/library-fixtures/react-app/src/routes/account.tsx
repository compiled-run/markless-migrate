import { createFileRoute } from '@tanstack/react-router'
import { DeleteUser } from '@/features/delete-user'

export const Route = createFileRoute('/account')({ component: DeleteUser })
