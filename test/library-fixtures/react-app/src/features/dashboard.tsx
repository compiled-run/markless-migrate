import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Chart } from './chart'

export function Dashboard() {
  return (
    <main>
      <Button variant='outline'>Download</Button>
      <Tabs defaultValue='overview'>
        <TabsList>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='analytics'>Analytics</TabsTrigger>
          <TabsTrigger value='reports' disabled>
            Reports
          </TabsTrigger>
        </TabsList>
        <TabsContent value='overview'>
          <Chart />
        </TabsContent>
      </Tabs>
    </main>
  )
}
