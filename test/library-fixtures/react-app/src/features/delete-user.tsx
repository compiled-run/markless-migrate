import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export function DeleteUser() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='ghost'>Delete</Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-sm' onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogTitle>Delete this user?</DialogTitle>
        <DialogClose asChild>
          <Button variant='outline'>Cancel</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
