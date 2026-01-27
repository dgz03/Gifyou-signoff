import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type UpdatePayload = {
  name?: string;
  startDate?: string;
  endDate?: string | null;
  totalTarget?: number;
  perToneTarget?: number;
  tier?: number;
  description?: string | null;
  updatedAt?: string;
};

const mapUpdate = (updates: UpdatePayload) => {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.startDate !== undefined) payload.start_date = updates.startDate;
  if (updates.endDate !== undefined) payload.end_date = updates.endDate;
  if (updates.totalTarget !== undefined) payload.total_target = updates.totalTarget;
  if (updates.perToneTarget !== undefined) payload.per_tone_target = updates.perToneTarget;
  if (updates.tier !== undefined) payload.tier = updates.tier;
  if (updates.description !== undefined) payload.description = updates.description;
  payload.updated_at = updates.updatedAt ?? new Date().toISOString();
  return payload;
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const eventId = params.id;
  let updates: UpdatePayload = {};
  try {
    updates = await request.json();
  } catch {
    updates = {};
  }

  if (!eventId) {
    return NextResponse.json({ error: 'Missing event id.' }, { status: 400 });
  }

  const updatePayload = mapUpdate(updates);
  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'No updates provided.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('events')
    .update(updatePayload)
    .eq('id', eventId);

  if (error) {
    console.log('Event update failed:', error);
    return NextResponse.json({ error: 'Unable to update event.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const eventId = params.id;
  if (!eventId) {
    return NextResponse.json({ error: 'Missing event id.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) {
    console.log('Event delete failed:', error);
    return NextResponse.json({ error: 'Unable to delete event.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
