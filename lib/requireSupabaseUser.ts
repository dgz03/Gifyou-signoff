import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const requireSupabaseUser = async (request: Request) => {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    console.log('Supabase auth failed:', error?.message ?? 'No user');
    return null;
  }

  const enforceAllowlist = process.env.TEAM_ENFORCE_ALLOWLIST === 'true';
  if (enforceAllowlist) {
    const email = data.user.email?.toLowerCase() ?? '';
    const allowedEmails = new Set(
      (process.env.TEAM_ALLOWED_EMAILS ?? '')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)
    );
    const allowedDomains = new Set(
      (process.env.TEAM_ALLOWED_DOMAINS ?? '')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)
    );

    if (allowedEmails.size > 0 || allowedDomains.size > 0) {
      const domain = email.split('@')[1] ?? '';
      const emailAllowed = allowedEmails.size > 0 ? allowedEmails.has(email) : false;
      const domainAllowed = allowedDomains.size > 0 ? allowedDomains.has(domain) : false;
      if (!emailAllowed && !domainAllowed) {
        console.log('Supabase auth blocked for non-team email:', email);
        return null;
      }
    }
  }

  return data.user;
};
