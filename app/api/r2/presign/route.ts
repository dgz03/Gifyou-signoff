import { NextResponse } from 'next/server';
import AWS from 'aws-sdk';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

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

const sanitizeKeyPart = (value: string) => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
);

const buildSafeFileName = (value: string) => {
  const parts = value.split('.');
  if (parts.length === 1) {
    return sanitizeKeyPart(value) || 'asset';
  }
  const extension = sanitizeKeyPart(parts.pop() ?? '');
  const base = sanitizeKeyPart(parts.join('.')) || 'asset';
  return extension ? `${base}.${extension}` : base;
};

const buildPublicUrl = (key: string) => {
  if (!R2_PUBLIC_BASE_URL) return '';
  return `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
};

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!R2_BUCKET) {
    return NextResponse.json({ error: 'R2 not configured.' }, { status: 500 });
  }

  const s3 = buildS3Client();
  if (!s3) {
    return NextResponse.json({ error: 'Missing R2 credentials.' }, { status: 500 });
  }

  let payload: { fileName?: string; fileType?: string; eventId?: string } = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const { fileName, fileType, eventId } = payload;
  if (!fileName || !fileType) {
    return NextResponse.json({ error: 'Missing file metadata.' }, { status: 400 });
  }

  const safeEvent = sanitizeKeyPart(eventId ?? '') || 'general';
  const safeName = buildSafeFileName(fileName);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const key = `assets/${safeEvent}/${unique}-${safeName}`;

  try {
    const url = await s3.getSignedUrlPromise('putObject', {
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: fileType
    });

    return NextResponse.json({
      url,
      key,
      publicUrl: buildPublicUrl(key)
    });
  } catch (error) {
    console.log('R2 presign failed:', error);
    return NextResponse.json({ error: 'Unable to presign upload.' }, { status: 500 });
  }
}
