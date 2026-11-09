'use server';
import { redirect } from 'next/navigation';
import { clearAdminSession, secretMatches, setAdminSession } from '@/lib/admin-session';

export async function adminLogin(form: FormData): Promise<void> {
  if (!secretMatches(String(form.get('accessToken') ?? ''))) redirect('/admin/login?error=1');
  await setAdminSession();
  redirect('/admin');
}
export async function adminLogout(): Promise<void> {
  await clearAdminSession();
  redirect('/admin/login');
}
