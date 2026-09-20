import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseMoney } from '@/app/game';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { usernames?: string[]; deposit?: string; limit?: string } | null;
  const requested = Array.from(new Set((body?.usernames ?? []).map(u => u.trim()).filter(Boolean)));
  if (!requested.length) return NextResponse.json({ error: 'Enter at least one username to invite.' }, { status: 400 });

  const depositCents = parseMoney(body?.deposit ?? '');
  if (depositCents === null || depositCents <= 0) return NextResponse.json({ error: 'Enter a positive deposit amount.' }, { status: 400 });

  let limitCents: number | null = null;
  if (body?.limit) {
    limitCents = parseMoney(body.limit);
    if (limitCents === null || limitCents <= 0) return NextResponse.json({ error: 'Enter a positive limit amount, or leave it blank.' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: found } = await admin.from('profiles').select('id, username').in('username', requested);
  const foundByLower = new Map((found ?? []).map(p => [p.username.toLowerCase(), p]));
  const missing = requested.filter(name => !foundByLower.has(name.toLowerCase()));
  if (missing.length) return NextResponse.json({ error: `No player found with username "${missing[0]}".` }, { status: 404 });

  const invitees = requested.map(name => foundByLower.get(name.toLowerCase())!);
  if (invitees.some(p => p.id === user.id)) return NextResponse.json({ error: 'You can’t invite yourself.' }, { status: 400 });

  const { data: batch, error: batchError } = await admin
    .from('invite_batches')
    .insert({ inviter_id: user.id, deposit_amount_cents: depositCents, limit_amount_cents: limitCents })
    .select('id')
    .single();
  if (batchError || !batch) return NextResponse.json({ error: 'Could not create the invitation.' }, { status: 500 });

  const { error: invitationsError } = await admin
    .from('invitations')
    .insert(invitees.map(invitee => ({ batch_id: batch.id, invitee_id: invitee.id })));
  if (invitationsError) return NextResponse.json({ error: 'Could not invite one or more of those players.' }, { status: 500 });

  return NextResponse.json({ batchId: batch.id });
}
