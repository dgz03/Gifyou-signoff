import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type IncomingGroup = {
  id: string;
  name: string;
  description?: string;
  eventId?: string | null;
  updatedAt?: string;
};

const mapToDbGroup = (group: IncomingGroup) => ({
  id: group.id,
  name: group.name,
  description: group.description ?? null,
  event_id: group.eventId ?? null,
  updated_at: group.updatedAt ?? new Date().toISOString()
});

export async function GET(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('text_groups')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.log('Text groups fetch failed:', error);
    return NextResponse.json({ error: 'Unable to load text groups.' }, { status: 500 });
  }

  return NextResponse.json({ groups: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { groups?: IncomingGroup[] } = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const groups = Array.isArray(payload.groups) ? payload.groups : [];
  if (groups.length === 0) {
    return NextResponse.json({ error: 'No groups provided.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('text_groups')
    .upsert(groups.map(mapToDbGroup), { onConflict: 'id' });

  if (error) {
    console.log('Text groups save failed:', error);
    return NextResponse.json({ error: 'Unable to save text groups.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
