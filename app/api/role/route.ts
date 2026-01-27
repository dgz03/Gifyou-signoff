import { NextResponse } from 'next/server';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type Role = 'creator' | 'reviewer';

type RoleMatch = {
  role: Role;
  locked: boolean;
};

const normalizeList = (value?: string) => (
  (value ?? '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
);

const matchRole = (email: string): RoleMatch => {
  const lowerEmail = email.toLowerCase();
  const domain = lowerEmail.split('@')[1] ?? '';

  const reviewerEmails = new Set(normalizeList(process.env.TEAM_REVIEWER_EMAILS));
  const creatorEmails = new Set(normalizeList(process.env.TEAM_CREATOR_EMAILS));
  const reviewerDomains = new Set(normalizeList(process.env.TEAM_REVIEWER_DOMAINS));
  const creatorDomains = new Set(normalizeList(process.env.TEAM_CREATOR_DOMAINS));

  if (reviewerEmails.size > 0 && reviewerEmails.has(lowerEmail)) {
    return { role: 'reviewer', locked: true };
  }
  if (creatorEmails.size > 0 && creatorEmails.has(lowerEmail)) {
    return { role: 'creator', locked: true };
  }
  if (reviewerDomains.size > 0 && reviewerDomains.has(domain)) {
    return { role: 'reviewer', locked: true };
  }
  if (creatorDomains.size > 0 && creatorDomains.has(domain)) {
    return { role: 'creator', locked: true };
  }

  return { role: 'creator', locked: false };
};

export async function GET(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = user.email ?? '';
  if (!email) {
    return NextResponse.json({ role: 'creator', locked: false });
  }

  const match = matchRole(email);
  return NextResponse.json(match);
}
