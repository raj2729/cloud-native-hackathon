import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin-session';
import { getObservabilitySnapshot } from '@/lib/search';
import { getDash0Summary, safeDashboardUrl } from '@/lib/dash0';
import { OPERATIONS } from '@/lib/observability';
import { AdminDashboard } from '@/components/admin-dashboard';
import { requestNow } from '@/lib/now';

export const dynamic = 'force-dynamic';
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ minutes?: string; operation?: string }> }) {
  if (!(await isAdmin())) redirect('/admin/login');
  const params = await searchParams;
  const minutes = [15, 60, 240].includes(Number(params.minutes)) ? Number(params.minutes) : 15;
  const operation = OPERATIONS.find((value) => value === params.operation) ?? 'discovery';
  const [records, dash0] = await Promise.allSettled([getObservabilitySnapshot(minutes, operation), getDash0Summary(minutes, operation)]);
  const updatedAt = await requestNow();
  return <AdminDashboard key={`${operation}-${minutes}`} minutes={minutes} operation={operation}
    initialSnapshot={records.status === 'fulfilled' ? records.value : null}
    initialDash0={dash0.status === 'fulfilled' ? dash0.value : null}
    initialUpdatedAt={updatedAt}
    dashboardUrl={safeDashboardUrl(process.env.DASH0_DASHBOARD_URL)}
    slackUrl={safeDashboardUrl(process.env.DASH0_SLACK_CHANNEL_URL)}
    mcpUrl={safeDashboardUrl(process.env.DASH0_MCP_ENDPOINT)}
    otelConfigured={Boolean(process.env.DASH0_ENDPOINT && process.env.DASH0_AUTH_TOKEN)} />;
}
