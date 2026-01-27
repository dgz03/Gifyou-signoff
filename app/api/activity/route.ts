import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type IncomingActivity = {
  id: string;
  subjectType: string;
  subjectId: string;
  action: string;
  actor: string;
  timestamp: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  comment?: string;
};

const mapToDbActivity = (entry: IncomingActivity) => ({
  id: entry.id,
  subject_type: entry.subjectType,
  subject_id: entry.subjectId,
  action: entry.action,
  actor: entry.actor,
  timestamp: entry.timestamp,
  from_status: entry.fromStatus ?? null,
  to_status: entry.toStatus ?? null,
  comment: entry.comment ?? null
});

export async function GET(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('activity_logs')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) {
    console.log('Activity fetch failed:', error);
    return NextResponse.json({ error: 'Unable to load activity.' }, { status: 500 });
  }

  return NextResponse.json({ activity: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { activity?: IncomingActivity[] } = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const activity = Array.isArray(payload.activity) ? payload.activity : [];
  if (activity.length === 0) {
    return NextResponse.json({ error: 'No activity provided.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('activity_logs')
    .upsert(activity.map(mapToDbActivity), { onConflict: 'id' });

  if (error) {
    console.log('Activity save failed:', error);
    return NextResponse.json({ error: 'Unable to save activity.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
