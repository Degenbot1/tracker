import { redirect } from 'next/navigation'
import { usersCount } from '@/lib/auth.ts'
import AuthForm from '@/components/AuthForm.tsx'

export const dynamic = 'force-dynamic'

export default async function Setup() {
  if ((await usersCount()) > 0) redirect('/login')
  return <AuthForm mode="setup" />
}
