import { NextResponse } from 'next/server';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type Role = 'creator' | 'reviewer';

type RoleMatch = {
  role: Role;
  locked: boolean;
  reviewerStage: 1 | 2 | null;
};

const normalizeList = (value?: string) => (
  (value ?? '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
);

const STAGE1_EMAILS = new Set(['jourdan@gifview.com']);
const STAGE2_EMAILS = new Set(['sabina@gifview.com']);

const matchRole = (email: string): RoleMatch => {
  const lowerEmail = email.toLowerCase();
  const domain = lowerEmail.split('@')[1] ?? '';

  if (STAGE1_EMAILS.has(lowerEmail)) {
    return { role: 'reviewer', locked: true, reviewerStage: 1 };
  }
  if (STAGE2_EMAILS.has(lowerEmail)) {
    return { role: 'reviewer', locked: true, reviewerStage: 2 };
  }

  const reviewerEmails = new Set(normalizeList(process.env.TEAM_REVIEWER_EMAILS));
  const creatorEmails = new Set(normalizeList(process.env.TEAM_CREATOR_EMAILS));
  const reviewerDomains = new Set(normalizeList(process.env.TEAM_REVIEWER_DOMAINS));
  const creatorDomains = new Set(normalizeList(process.env.TEAM_CREATOR_DOMAINS));

  if (reviewerEmails.size > 0 && reviewerEmails.has(lowerEmail)) {
    return { role: 'reviewer', locked: true, reviewerStage: 2 };
  }
  if (creatorEmails.size > 0 && creatorEmails.has(lowerEmail)) {
    return { role: 'creator', locked: true, reviewerStage: null };
  }
  if (reviewerDomains.size > 0 && reviewerDomains.has(domain)) {
    return { role: 'reviewer', locked: true, reviewerStage: 2 };
  }
  if (creatorDomains.size > 0 && creatorDomains.has(domain)) {
    return { role: 'creator', locked: true, reviewerStage: null };
  }

  return { role: 'creator', locked: false, reviewerStage: null };
};

export async function GET(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = user.email ?? '';
  if (!email) {
    return NextResponse.json({ role: 'creator', locked: false, reviewerStage: null });
  }

  const match = matchRole(email);
  return NextResponse.json(match);
}
