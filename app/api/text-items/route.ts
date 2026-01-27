import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type IncomingItem = {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  author: string;
  reviewer?: string | null;
  tags?: string[];
  reviewNotes?: string;
  groupId?: string;
  sectionId?: string;
  updatedAt?: string;
};

const mapToDbItem = (item: IncomingItem) => ({
  id: item.id,
  title: item.title,
  body: item.body,
  category: item.category,
  status: item.status,
  author: item.author,
  reviewer: item.reviewer ?? null,
  tags: item.tags ?? [],
  review_notes: item.reviewNotes ?? null,
  group_id: item.groupId ?? null,
  section_id: item.sectionId ?? null,
  updated_at: item.updatedAt ?? new Date().toISOString()
});

export async function GET(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('text_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.log('Text items fetch failed:', error);
    return NextResponse.json({ error: 'Unable to load text items.' }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { items?: IncomingItem[] } = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: 'No items provided.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('text_items')
    .upsert(items.map(mapToDbItem), { onConflict: 'id' });

  if (error) {
    console.log('Text items save failed:', error);
    return NextResponse.json({ error: 'Unable to save text items.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
