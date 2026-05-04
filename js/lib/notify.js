
// js/lib/notify.js
import { supabase } from '../supabase.js';

export async function sendExternalNotification(recipientUserId, type, data) {
  try {
    // This edge function must be deployed separately
    const { error } = await supabase.functions.invoke('send-notification', {
      body: { recipient_user_id: recipientUserId, notification_type: type, data }
    });
    if (error) console.error('Notification error:', error);
  } catch (e) {
    console.error('Notification invocation failed', e);
  }
}