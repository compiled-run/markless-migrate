import { getCoreRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table'
import { columns, type User } from './columns'
import { Pager } from './pager'

export function Users({ data }: { data: User[] }) {
  const table = useReactTable({ data, columns, enableRowSelection: true, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel() })
  return (
    <section>
      {table.getRowModel().rows.map((row) => (
        <p key={row.id}>{row.id}</p>
      ))}
      <Pager table={table} />
    </section>
  )
}
