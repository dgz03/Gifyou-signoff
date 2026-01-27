import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type UpdatePayload = {
  title?: string;
  body?: string;
  category?: string;
  status?: string;
  author?: string;
  reviewer?: string | null;
  tags?: string[];
  reviewNotes?: string;
  groupId?: string | null;
  sectionId?: string | null;
  updatedAt?: string;
};

const mapUpdate = (updates: UpdatePayload) => {
  const payload: Record<string, unknown> = {};
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.body !== undefined) payload.body = updates.body;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.author !== undefined) payload.author = updates.author;
  if (updates.reviewer !== undefined) payload.reviewer = updates.reviewer;
  if (updates.tags !== undefined) payload.tags = updates.tags;
  if (updates.reviewNotes !== undefined) payload.review_notes = updates.reviewNotes;
  if (updates.groupId !== undefined) payload.group_id = updates.groupId;
  if (updates.sectionId !== undefined) payload.section_id = updates.sectionId;
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

  const itemId = params.id;
  let updates: UpdatePayload = {};
  try {
    updates = await request.json();
  } catch {
    updates = {};
  }

  if (!itemId) {
    return NextResponse.json({ error: 'Missing item id.' }, { status: 400 });
  }

  const updatePayload = mapUpdate(updates);
  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'No updates provided.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('text_items')
    .update(updatePayload)
    .eq('id', itemId);

  if (error) {
    console.log('Text item update failed:', error);
    return NextResponse.json({ error: 'Unable to update text item.' }, { status: 500 });
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

  const itemId = params.id;
  if (!itemId) {
    return NextResponse.json({ error: 'Missing item id.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('text_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    console.log('Text item delete failed:', error);
    return NextResponse.json({ error: 'Unable to delete text item.' }, { status: 500 });
  }

  const { error: activityError } = await supabaseAdmin
    .from('activity_logs')
    .delete()
    .eq('subject_type', 'text')
    .eq('subject_id', itemId);

  if (activityError) {
    console.log('Activity cleanup failed:', activityError);
  }

  return NextResponse.json({ success: true });
}
