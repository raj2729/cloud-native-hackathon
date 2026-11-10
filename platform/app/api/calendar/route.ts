import { getCurrentUser } from '@/lib/session';
import { getEvent } from '@/lib/search';
import { prepareDayPlan } from '@/lib/day-plan-service';
import { dayPlanCalendar } from '@/lib/calendar';

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Choose or create a profile first.', { status: 401 });
  const query = new URL(request.url).searchParams;
  const eventId = query.get('event');
  const date = query.get('date');
  if (!eventId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response('Select a conference and day.', { status: 400 });
  const event = await getEvent(eventId);
  if (!event) return new Response('Conference not found.', { status: 404 });
  const { plan } = await prepareDayPlan(user, event, { date });
  if (plan.date !== date) return new Response('Schedule day not found.', { status: 404 });
  return new Response(dayPlanCalendar(plan, event, user.id), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="converge-${date}.ics"`,
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
    },
  });
}
