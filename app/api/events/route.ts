import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type IncomingEvent = {
  id: string;
  name: string;
  startDate: string;
  endDate?: string | null;
  totalTarget: number;
  perToneTarget?: number;
  tier: number;
  description?: string | null;
  updatedAt?: string;
};

const mapToDbEvent = (event: IncomingEvent) => ({
  id: event.id,
  name: event.name,
  start_date: event.startDate,
  end_date: event.endDate ?? null,
  total_target: event.totalTarget,
  per_tone_target: event.perToneTarget ?? 0,
  tier: event.tier,
  description: event.description ?? null,
  updated_at: event.updatedAt ?? new Date().toISOString()
});

export async function GET(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('events')
    .select('*')
    .order('start_date', { ascending: true });

  if (error) {
    console.log('Events fetch failed:', error);
    return NextResponse.json({ error: 'Unable to load events.' }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { events?: IncomingEvent[] } = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  if (events.length === 0) {
    return NextResponse.json({ error: 'No events provided.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('events')
    .upsert(events.map(mapToDbEvent), { onConflict: 'id' });

  if (error) {
    console.log('Events save failed:', error);
    return NextResponse.json({ error: 'Unable to save events.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
