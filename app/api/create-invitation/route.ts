import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseMoney } from '@/app/game';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { username?: string; deposit?: string; limit?: string } | null;
  const username = body?.username?.trim();
  if (!username) return NextResponse.json({ error: 'Enter a username to invite.' }, { status: 400 });

  const depositCents = parseMoney(body?.deposit ?? '');
  if (depositCents === null || depositCents <= 0) return NextResponse.json({ error: 'Enter a positive deposit amount.' }, { status: 400 });

  let limitCents: number | null = null;
  if (body?.limit) {
    limitCents = parseMoney(body.limit);
    if (limitCents === null || limitCents <= 0) return NextResponse.json({ error: 'Enter a positive limit amount, or leave it blank.' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invitee } = await admin.from('profiles').select('id, username').ilike('username', username).maybeSingle();
  if (!invitee) return NextResponse.json({ error: `No player found with username "${username}".` }, { status: 404 });
  if (invitee.id === user.id) return NextResponse.json({ error: 'You can’t invite yourself.' }, { status: 400 });

  const { data: existing } = await admin
    .from('invitations')
    .select('id')
    .eq('inviter_id', user.id)
    .eq('invitee_id', invitee.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) return NextResponse.json({ error: `You already have a pending invite to ${invitee.username}.` }, { status: 409 });

  const { data: invitation, error } = await admin
    .from('invitations')
    .insert({
      inviter_id: user.id,
      invitee_id: invitee.id,
      deposit_amount_cents: depositCents,
      limit_amount_cents: limitCents,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: 'Could not create the invitation.' }, { status: 500 });
  return NextResponse.json({ invitationId: invitation.id });
}
