// js/lib/activity.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';

let activeInterval = null;

export function startActiveTracking() {
  if (activeInterval) clearInterval(activeInterval);
  updateActiveStatus();
  activeInterval = setInterval(() => {
    updateActiveStatus();
  }, 2 * 60 * 1000);
}

export function stopActiveTracking() {
  if (activeInterval) {
    clearInterval(activeInterval);
    activeInterval = null;
  }
}

async function updateActiveStatus() {
  const user = getCurrentUser();
  if (!user) return;
  try {
    await supabase.rpc('update_last_active', { user_id: user.id });
  } catch (err) {
    console.error('Failed to update last_active', err);
  }
}