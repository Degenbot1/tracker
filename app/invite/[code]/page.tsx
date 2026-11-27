import AuthForm from '@/components/AuthForm.tsx'

export default async function Invite({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <AuthForm mode="invite" code={code} />
}
