import { redirect } from 'next/navigation'
import { currentUser, usersCount } from '@/lib/auth.ts'
import Shell from '@/components/Shell.tsx'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser()
  if (!u) redirect((await usersCount()) === 0 ? '/setup' : '/login')
  return <Shell user={{ id: u.id, name: u.name, role: u.role, team: process.env.TEAM_NAME || 'Team' }}>{children}</Shell>
}
