import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type IncomingSection = {
  id: string;
  groupId: string;
  name: string;
  description?: string;
  updatedAt?: string;
};

const mapToDbSection = (section: IncomingSection) => ({
  id: section.id,
  group_id: section.groupId,
  name: section.name,
  description: section.description ?? null,
  updated_at: section.updatedAt ?? new Date().toISOString()
});

export async function GET(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('text_sections')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.log('Text sections fetch failed:', error);
    return NextResponse.json({ error: 'Unable to load text sections.' }, { status: 500 });
  }

  return NextResponse.json({ sections: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { sections?: IncomingSection[] } = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  if (sections.length === 0) {
    return NextResponse.json({ error: 'No sections provided.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('text_sections')
    .upsert(sections.map(mapToDbSection), { onConflict: 'id' });

  if (error) {
    console.log('Text sections save failed:', error);
    return NextResponse.json({ error: 'Unable to save text sections.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
