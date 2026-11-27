import { redirect } from 'next/navigation'
import { currentUser, usersCount } from '@/lib/auth.ts'
import AuthForm from '@/components/AuthForm.tsx'

export const dynamic = 'force-dynamic'

export default async function Login() {
  if (await currentUser()) redirect('/')
  if ((await usersCount()) === 0) redirect('/setup')
  return <AuthForm mode="login" />
}
