import { type ColumnDef } from '@tanstack/react-table'

export type User = { name: string; email: string }

export const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <span onClick={() => column.toggleSorting()}>Name</span>,
    cell: ({ row }) => <span>{row.getValue('name')}</span>,
  },
]
