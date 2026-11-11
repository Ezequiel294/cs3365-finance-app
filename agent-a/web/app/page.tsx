import { redirect } from 'next/navigation';
import { SessionService } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await SessionService.getSession();
  redirect(session ? '/dashboard' : '/login');
}
