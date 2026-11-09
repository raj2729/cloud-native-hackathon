import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin-session';
import { adminLogin } from './actions';
export const dynamic = 'force-dynamic';
export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdmin()) redirect('/admin');
  const { error } = await searchParams;
  return <div className="max-w-md mx-auto py-16 space-y-5">
    <h1 className="text-3xl font-semibold">Admin access</h1>
    <p className="text-muted">Service health, reliability targets and incident triage for conference administrators.</p>
    {!process.env.ADMIN_ACCESS_TOKEN ? <p className="card p-5">Set ADMIN_ACCESS_TOKEN on the server to enable the admin dashboard.</p> :
    <form action={adminLogin} className="card p-5 space-y-4">
      <label className="block text-sm" htmlFor="admin-access">Admin access code</label>
      <input id="admin-access" name="accessToken" type="password" required maxLength={512} autoComplete="current-password" className="input" />
      {error && <p role="alert" className="text-warn text-sm">The access code was not recognised.</p>}
      <button className="btn btn-primary">Open admin dashboard</button>
    </form>}
  </div>;
}
