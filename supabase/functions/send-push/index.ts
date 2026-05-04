// supabase/functions/send-push/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!
);

const ONESIGNAL_API_KEY = Deno.env.get('ONESIGNAL_API_KEY');
const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');

Deno.serve(async (req) => {
  try {
    const { recipient_user_id, title, message, data } = await req.json();

    if (!recipient_user_id || !title || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    // Get recipient's profile
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('onesignal_player_id, is_ios')
      .eq('id', recipient_user_id)
      .single();

    if (error || !profile) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
    }

    // If user has a player ID, send push
    if (profile.onesignal_player_id && !profile.is_ios) {
      const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${ONESIGNAL_API_KEY}`,
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          include_player_ids: [profile.onesignal_player_id],
          headings: { en: title },
          contents: { en: message },
          data: data || {},
          web_buttons: [{ id: 'open', text: 'Open', icon: 'https://futiaspace.com.ng/icon-192.png' }],
        }),
      });
      const result = await response.json();
      return new Response(JSON.stringify({ success: true, result }), { status: 200 });
    } else {
      // No push (iOS or no player ID) – we'll later add email
      return new Response(JSON.stringify({ info: 'No push device; email fallback not implemented yet' }), { status: 200 });
    }
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});