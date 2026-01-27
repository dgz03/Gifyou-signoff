import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';
const TELEGRAM_UPLOAD_BATCH_SIZE = Number.parseInt(
  process.env.TELEGRAM_UPLOAD_BATCH_SIZE ?? '36',
  10
);

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

const sendTelegramMessage = async (message: string) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        disable_web_page_preview: true
      })
    });
    return response.ok;
  } catch (error) {
    console.log('Telegram notification failed:', error);
    return false;
  }
};

const notifyTelegramUploads = async (assets: IncomingAsset[]) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  if (!Number.isFinite(TELEGRAM_UPLOAD_BATCH_SIZE) || TELEGRAM_UPLOAD_BATCH_SIZE <= 0) return;
  if (assets.length === 0) return;

  const { data: state, error: stateError } = await supabaseAdmin
    .from('notification_state')
    .select('count')
    .eq('id', 'telegram_uploads')
    .maybeSingle();

  if (stateError) {
    console.log('Notification state lookup failed:', stateError);
  }

  const currentCount = state?.count ?? 0;
  const nextCount = currentCount + assets.length;
  const batchCount = Math.floor(nextCount / TELEGRAM_UPLOAD_BATCH_SIZE);
  const remaining = nextCount % TELEGRAM_UPLOAD_BATCH_SIZE;

  if (batchCount <= 0) {
    await supabaseAdmin
      .from('notification_state')
      .upsert({ id: 'telegram_uploads', count: nextCount }, { onConflict: 'id' });
    return;
  }

  const notifyCount = TELEGRAM_UPLOAD_BATCH_SIZE * batchCount;
  const sent = await sendTelegramMessage(
    `📦 ${notifyCount} new uploads are ready for review.`
  );

  if (sent) {
    await supabaseAdmin
      .from('notification_state')
      .upsert(
        { id: 'telegram_uploads', count: remaining, last_notified_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
  } else {
    await supabaseAdmin
      .from('notification_state')
      .upsert({ id: 'telegram_uploads', count: nextCount }, { onConflict: 'id' });
  }
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

  try {
    await notifyTelegramUploads(assets);
  } catch (notifyError) {
    console.log('Upload notification failed:', notifyError);
  }

  return NextResponse.json({ success: true });
}
