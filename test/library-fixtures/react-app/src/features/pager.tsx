import { type Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'

type PagerProps<TData> = {
  table: Table<TData>
  label?: string
}

export function Pager<TData>({ table }: PagerProps<TData>) {
  return (
    <Button size='icon' variant='ghost' disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
      Next
    </Button>
  )
}
