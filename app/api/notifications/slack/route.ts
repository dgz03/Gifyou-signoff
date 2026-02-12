import { NextResponse } from 'next/server';
import { requireSupabaseUser } from '@/lib/requireSupabaseUser';

export const runtime = 'nodejs';

type SlackPayload = {
  message?: string;
  webhookUrl?: string;
};

const isAllowedSlackWebhook = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const hostAllowed = host === 'hooks.slack.com' || host === 'hooks.slack-gov.com';
    return hostAllowed && path.startsWith('/services/');
  } catch {
    return false;
  }
};

export async function POST(request: Request) {
  const user = await requireSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: SlackPayload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const message = payload.message?.trim() ?? '';
  const webhookUrl = (
    payload.webhookUrl?.trim()
    || process.env.SLACK_WEBHOOK_URL?.trim()
    || process.env.SLACK_NOTIFICATIONS_WEBHOOK_URL?.trim()
    || ''
  );

  if (!message) {
    return NextResponse.json({ error: 'Missing message.' }, { status: 400 });
  }

  if (!webhookUrl) {
    return NextResponse.json({ error: 'Missing Slack webhook URL.' }, { status: 400 });
  }

  if (!isAllowedSlackWebhook(webhookUrl)) {
    return NextResponse.json({ error: 'Invalid Slack webhook URL.' }, { status: 400 });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message })
    });

    if (!response.ok) {
      const details = await response.text();
      console.log('Slack notification failed:', response.status, details);
      return NextResponse.json({ error: 'Slack request failed.' }, { status: 502 });
    }
  } catch (error) {
    console.log('Slack notification failed:', error);
    return NextResponse.json({ error: 'Unable to reach Slack.' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
