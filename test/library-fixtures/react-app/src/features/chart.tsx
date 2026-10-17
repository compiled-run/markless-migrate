import { Bar, BarChart, ResponsiveContainer, XAxis } from 'recharts'

const data = [{ name: 'Jan', total: 10 }]

export function Chart() {
  return (
    <ResponsiveContainer width='100%' height={350}>
      <BarChart data={data}>
        <XAxis dataKey='name' fontSize={12} tickLine={false} />
        <Bar dataKey='total' radius={[4, 4, 0, 0]} className='fill-primary' />
      </BarChart>
    </ResponsiveContainer>
  )
}
