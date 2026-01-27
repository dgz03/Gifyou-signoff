import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type UpdatePayload = {
  name?: string;
  description?: string;
  groupId?: string;
  updatedAt?: string;
};

const mapUpdate = (updates: UpdatePayload) => {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.groupId !== undefined) payload.group_id = updates.groupId;
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

  const sectionId = params.id;
  let updates: UpdatePayload = {};
  try {
    updates = await request.json();
  } catch {
    updates = {};
  }

  if (!sectionId) {
    return NextResponse.json({ error: 'Missing section id.' }, { status: 400 });
  }

  const updatePayload = mapUpdate(updates);
  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'No updates provided.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('text_sections')
    .update(updatePayload)
    .eq('id', sectionId);

  if (error) {
    console.log('Text section update failed:', error);
    return NextResponse.json({ error: 'Unable to update text section.' }, { status: 500 });
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

  const sectionId = params.id;
  if (!sectionId) {
    return NextResponse.json({ error: 'Missing section id.' }, { status: 400 });
  }

  const { error: itemsError } = await supabaseAdmin
    .from('text_items')
    .update({ section_id: null, updated_at: new Date().toISOString() })
    .eq('section_id', sectionId);

  if (itemsError) {
    console.log('Text items cleanup failed:', itemsError);
  }

  const { error } = await supabaseAdmin
    .from('text_sections')
    .delete()
    .eq('id', sectionId);

  if (error) {
    console.log('Text section delete failed:', error);
    return NextResponse.json({ error: 'Unable to delete text section.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
