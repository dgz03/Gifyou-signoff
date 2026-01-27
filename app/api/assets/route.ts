import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type IncomingAsset = {
  id: string;
  title: string;
  eventId: string;
  skinTone: string;
  status: string;
  uploader: string;
  reviewer?: string | null;
  createdAt: string;
  updatedAt?: string;
  version?: number;
  notesRefinement?: string;
  notesIdeas?: string;
  previewColor?: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaStorage?: string;
  fileName?: string;
  fileSize?: number;
};

const mapToDbAsset = (asset: IncomingAsset) => ({
  id: asset.id,
  title: asset.title,
  event_id: asset.eventId,
  skin_tone: asset.skinTone,
  status: asset.status,
  uploader: asset.uploader,
  reviewer: asset.reviewer ?? null,
  created_at: asset.createdAt,
  updated_at: asset.updatedAt ?? null,
  version: asset.version ?? 1,
  notes_refinement: asset.notesRefinement ?? null,
  notes_ideas: asset.notesIdeas ?? null,
  preview_color: asset.previewColor ?? null,
  media_url: asset.mediaUrl ?? null,
  media_type: asset.mediaType ?? null,
  media_storage: asset.mediaStorage ?? null,
  file_name: asset.fileName ?? null,
  file_size: asset.fileSize ?? null
});

export async function GET(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.log('Assets fetch failed:', error);
    return NextResponse.json({ error: 'Unable to load assets.' }, { status: 500 });
  }

  return NextResponse.json({ assets: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { assets?: IncomingAsset[] } = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  if (assets.length === 0) {
    return NextResponse.json({ error: 'No assets provided.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('assets').upsert(
    assets.map(mapToDbAsset),
    { onConflict: 'id' }
  );

  if (error) {
    console.log('Assets save failed:', error);
    return NextResponse.json({ error: 'Unable to save assets.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
