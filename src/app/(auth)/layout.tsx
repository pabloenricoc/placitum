import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from './sidebar';

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const displayName =
    session.user.name ?? session.user.email ?? 'Usuário';

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar userName={displayName} />
      <main className="flex-1 bg-surface-container-lowest">{children}</main>
    </div>
  );
}
