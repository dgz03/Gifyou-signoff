import { NextResponse } from 'next/server';
import AWS from 'aws-sdk';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

const {
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL
} = process.env;

const buildS3Client = () => {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  return new AWS.S3({
    endpoint: new AWS.Endpoint(R2_ENDPOINT),
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    },
    signatureVersion: 'v4',
    region: 'auto'
  });
};

const extractR2Key = (mediaUrl?: string | null) => {
  if (!mediaUrl || !R2_PUBLIC_BASE_URL) return null;
  const base = R2_PUBLIC_BASE_URL.replace(/\/$/, '');
  if (!mediaUrl.startsWith(base)) return null;
  const key = mediaUrl.slice(base.length);
  return key.startsWith('/') ? key.slice(1) : key;
};

type UpdatePayload = {
  status?: string;
  reviewer?: string | null;
  notesRefinement?: string;
  notesIdeas?: string;
  updatedAt?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaStorage?: string | null;
};

const mapUpdate = (updates: UpdatePayload) => {
  const payload: Record<string, unknown> = {};
  if (updates.status) payload.status = updates.status;
  if (updates.reviewer !== undefined) payload.reviewer = updates.reviewer;
  if (updates.notesRefinement !== undefined) payload.notes_refinement = updates.notesRefinement;
  if (updates.notesIdeas !== undefined) payload.notes_ideas = updates.notesIdeas;
  if (updates.mediaUrl !== undefined) payload.media_url = updates.mediaUrl;
  if (updates.mediaType !== undefined) payload.media_type = updates.mediaType;
  if (updates.mediaStorage !== undefined) payload.media_storage = updates.mediaStorage;
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

  const assetId = params.id;
  let updates: UpdatePayload = {};
  try {
    updates = await request.json();
  } catch {
    updates = {};
  }

  if (!assetId) {
    return NextResponse.json({ error: 'Missing asset id.' }, { status: 400 });
  }

  const updatePayload = mapUpdate(updates);
  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'No updates provided.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('assets')
    .update(updatePayload)
    .eq('id', assetId);

  if (error) {
    console.log('Asset update failed:', error);
    return NextResponse.json({ error: 'Unable to update asset.' }, { status: 500 });
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

  const assetId = params.id;
  if (!assetId) {
    return NextResponse.json({ error: 'Missing asset id.' }, { status: 400 });
  }

  const { data: asset, error: fetchError } = await supabaseAdmin
    .from('assets')
    .select('media_url')
    .eq('id', assetId)
    .maybeSingle();

  if (fetchError) {
    console.log('Asset lookup failed:', fetchError);
  }

  const { error } = await supabaseAdmin
    .from('assets')
    .delete()
    .eq('id', assetId);

  if (error) {
    console.log('Asset delete failed:', error);
    return NextResponse.json({ error: 'Unable to delete asset.' }, { status: 500 });
  }

  const { error: activityError } = await supabaseAdmin
    .from('activity_logs')
    .delete()
    .eq('subject_type', 'asset')
    .eq('subject_id', assetId);

  if (activityError) {
    console.log('Activity cleanup failed:', activityError);
  }

  const key = extractR2Key(asset?.media_url ?? null);
  if (key && R2_BUCKET) {
    const s3 = buildS3Client();
    if (s3) {
      try {
        await s3.deleteObject({ Bucket: R2_BUCKET, Key: key }).promise();
      } catch (deleteError) {
        console.log('R2 delete failed:', deleteError);
      }
    }
  }

  return NextResponse.json({ success: true });
}
