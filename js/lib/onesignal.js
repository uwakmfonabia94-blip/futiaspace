// js/lib/onesignal.js
import { supabase } from '../supabase.js';

let onesignalInitialized = false;

export async function initOneSignal(userId) {
  if (onesignalInitialized) return;
  if (!window.OneSignal) {
    console.warn('OneSignal SDK not loaded yet – will retry in 2 seconds');
    setTimeout(() => initOneSignal(userId), 2000);
    return;
  }
  
  try {
    await window.OneSignal.push(async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await window.OneSignal.setExternalUserId(userId);
      // Do NOT auto‑register; wait for user action
      onesignalInitialized = true;
    });
  } catch (err) {
    console.error('OneSignal init error:', err);
  }
}

// Call this function when user clicks "Enable Notifications"
export async function requestPushPermission(userId) {
  if (!window.OneSignal) {
    console.warn('OneSignal not loaded');
    return false;
  }
  try {
    await window.OneSignal.push(async () => {
      await window.OneSignal.registerForPushNotifications();
      const playerId = await window.OneSignal.getDeviceId();
      if (playerId) {
        await supabase.from('profiles').update({ onesignal_player_id: playerId }).eq('id', userId);
        console.log('Push notifications enabled for user', userId);
      }
    });
    return true;
  } catch (err) {
    console.error('Push permission error:', err);
    return false;
  }
}

export async function detectIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export async function triggerPush(recipientUserId, title, message, data = {}) {
  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: { recipient_user_id: recipientUserId, title, message, data },
    });
    if (error) console.error('Push error:', error);
  } catch (err) {
    console.error('Push invocation failed:', err);
  }
}