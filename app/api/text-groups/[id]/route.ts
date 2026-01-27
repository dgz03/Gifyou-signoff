import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type UpdatePayload = {
  name?: string;
  description?: string;
  eventId?: string | null;
  updatedAt?: string;
};

const mapUpdate = (updates: UpdatePayload) => {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.eventId !== undefined) payload.event_id = updates.eventId;
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

  const groupId = params.id;
  let updates: UpdatePayload = {};
  try {
    updates = await request.json();
  } catch {
    updates = {};
  }

  if (!groupId) {
    return NextResponse.json({ error: 'Missing group id.' }, { status: 400 });
  }

  const updatePayload = mapUpdate(updates);
  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'No updates provided.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('text_groups')
    .update(updatePayload)
    .eq('id', groupId);

  if (error) {
    console.log('Text group update failed:', error);
    return NextResponse.json({ error: 'Unable to update text group.' }, { status: 500 });
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

  const groupId = params.id;
  if (!groupId) {
    return NextResponse.json({ error: 'Missing group id.' }, { status: 400 });
  }

  const { error: itemError } = await supabaseAdmin
    .from('text_items')
    .update({ group_id: null, section_id: null, updated_at: new Date().toISOString() })
    .eq('group_id', groupId);

  if (itemError) {
    console.log('Text items group cleanup failed:', itemError);
  }

  const { error: sectionError } = await supabaseAdmin
    .from('text_sections')
    .delete()
    .eq('group_id', groupId);

  if (sectionError) {
    console.log('Text sections delete failed:', sectionError);
  }

  const { error } = await supabaseAdmin
    .from('text_groups')
    .delete()
    .eq('id', groupId);

  if (error) {
    console.log('Text group delete failed:', error);
    return NextResponse.json({ error: 'Unable to delete text group.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
