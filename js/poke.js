/**
 * FutiaSpace — js/poke.js
 *
 * Handles all poke logic across the entire app:
 *
 *  • pokeUser(pokedId)
 *      – Inserts a row into public.pokes (unique constraint enforces one per pair)
 *      – Inserts a notification row for the poked user
 *      – Returns { success, alreadyPoked } so callers can update UI
 *
 *  • getPokesISent(profileIds)
 *      – Batch query: which of the given profile IDs has the current user poked?
 *      – Returns a Set<string> of IDs already poked
 *      – Used by directory.js to show correct poke button state on cards
 *
 *  • initPoke(profileId)
 *      – Wires the poke button on the profile view page (#btn-poke)
 *      – Checks if already poked, sets initial button state
 *      – Handles optimistic UI, rollback on failure
 *      – Refreshes the poke count displayed on the profile
 *
 * Rules enforced:
 *   1. A user cannot poke themselves (DB CHECK + JS guard)
 *   2. A user can only poke someone once (DB UNIQUE constraint + JS guard)
 *   3. Pokes are one-directional — no un-poking in V1
 */

import { supabase }                         from './supabase.js';
import { getCurrentProfile }                from './router.js';
import {
  showToast,
  getInitials,
  renderAvatar,
  escapeHtml,
}                                           from './utils.js';
import { getUnreadCount, updateNotifBadge } from './notifications.js';


// ════════════════════════════════════════════════════════════════
// 1.  POKE A USER
//     Called by both directory.js (card poke buttons) and
//     initPoke() (profile page poke button).
// ════════════════════════════════════════════════════════════════

/**
 * Send a poke from the current user to another user.
 *
 * Inserts into public.pokes and public.notifications in a single
 * sequential write. The DB UNIQUE constraint on (poker_id, poked_id)
 * is the authoritative guard — we also check client-side to avoid
 * unnecessary round trips.
 *
 * @param   {string} pokedId  UUID of the user to poke.
 * @returns {Promise<{ success: boolean, alreadyPoked: boolean }>}
 */
export async function pokeUser(pokedId) {
  const me = getCurrentProfile();
  if (!me) return { success: false, alreadyPoked: false };

  // Guard: cannot poke yourself
  if (me.id === pokedId) {
    return { success: false, alreadyPoked: false };
  }

  try {
    // ── Step 1: Insert poke row ──────────────────────────────────
    const { error: pokeError } = await supabase
      .from('pokes')
      .insert({ poker_id: me.id, poked_id: pokedId });

    if (pokeError) {
      // Postgres unique_violation code = 23505
      // Supabase surfaces this as code '23505' or message containing 'unique'
      const isUnique =
        pokeError.code === '23505' ||
        pokeError.message?.toLowerCase().includes('unique') ||
        pokeError.message?.toLowerCase().includes('duplicate');

      if (isUnique) {
        return { success: false, alreadyPoked: true };
      }
      console.error('[poke] insert poke error:', pokeError.message);
      return { success: false, alreadyPoked: false };
    }

    // ── Step 2: Insert in-app notification for the poked user ────
    // This is a fire-and-forget — if it fails, the poke still went through.
    // The poke_count trigger on the DB handles incrementing poke_count.
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id     : pokedId,
        type        : 'poke',
        from_user_id: me.id,
        read        : false,
      });

    if (notifError) {
      // Non-fatal — poke succeeded, notification just won't appear
      console.warn('[poke] notification insert failed:', notifError.message);
    }

    return { success: true, alreadyPoked: false };

  } catch (err) {
    console.error('[poke] unexpected error:', err);
    return { success: false, alreadyPoked: false };
  }
}


// ════════════════════════════════════════════════════════════════
// 2.  GET POKES I SENT  (batch)
//     Used by directory.js to mark which cards are already poked.
// ════════════════════════════════════════════════════════════════

/**
 * Batch-check which of the given profile IDs the current user has poked.
 *
 * @param   {string[]} profileIds  Array of profile UUIDs to check.
 * @returns {Promise<Set<string>>} Set of profile IDs the current user has poked.
 */
export async function getPokesISent(profileIds) {
  const me = getCurrentProfile();
  if (!me || !profileIds || profileIds.length === 0) return new Set();

  // Filter out own ID before querying
  const others = profileIds.filter(id => id !== me.id);
  if (others.length === 0) return new Set();

  try {
    const { data, error } = await supabase
      .from('pokes')
      .select('poked_id')
      .eq('poker_id', me.id)
      .in('poked_id', others);

    if (error) {
      console.error('[poke] getPokesISent error:', error.message);
      return new Set();
    }

    return new Set((data || []).map(row => row.poked_id));

  } catch (err) {
    console.error('[poke] getPokesISent unexpected:', err);
    return new Set();
  }
}


// ════════════════════════════════════════════════════════════════
// 3.  INIT POKE  — profile page poke button
//     Called by profile.js after the profile content is rendered.
// ════════════════════════════════════════════════════════════════

/**
 * Wire and initialise the poke button on the profile view page.
 *
 * @param {string} profileId  UUID of the profile being viewed.
 */
export async function initPoke(profileId) {
  const btn      = document.getElementById('btn-poke');
  const btnText  = document.getElementById('poke-btn-text');
  const me       = getCurrentProfile();

  if (!btn || !me) return;

  // Don't show poke on own profile — profile.js already hides it,
  // but guard here too in case of race conditions
  if (me.id === profileId) {
    btn.classList.add('hidden');
    return;
  }

  // ── Check if already poked ────────────────────────────────────
  // Set button to a neutral loading state while we check
  btn.disabled = true;
  if (btnText) btnText.textContent = '...';

  let alreadyPoked = false;

  try {
    const { data, error } = await supabase
      .from('pokes')
      .select('id')
      .eq('poker_id', me.id)
      .eq('poked_id', profileId)
      .maybeSingle();

    if (!error && data) alreadyPoked = true;
  } catch {
    // Non-critical — assume not poked, let the DB constraint handle it
  }

  // ── Set initial button state ──────────────────────────────────
  _setProfilePokeBtn(btn, alreadyPoked);
  btn.disabled = false;

  // Remove any previous listener to prevent duplicates on re-render
  const newBtn = _replaceWithClone(btn);
  if (!newBtn) return;

  // ── Wire click handler ────────────────────────────────────────
  newBtn.addEventListener('click', async () => {
    const isAlreadyPoked = newBtn.classList.contains('poked');
    if (isAlreadyPoked) return; // one-way in V1

    // Optimistic UI — flip immediately
    _setProfilePokeBtn(newBtn, true);
    newBtn.disabled = true;

    const { success, alreadyPoked: serverAlready } = await pokeUser(profileId);

    if (success) {
      // Increment the displayed poke count
      _incrementPokeCount();

      // Refresh the notification badge in the bottom nav
      // (the person who just got poked won't see this, but it keeps
      //  the badge accurate if the user is viewing their own profile in another tab)
      const count = await getUnreadCount();
      updateNotifBadge(count);

      showToast('Poke sent!', 'success', 2000);
      newBtn.disabled = false;

    } else if (serverAlready) {
      // Already poked — state was already correct, just keep it
      _setProfilePokeBtn(newBtn, true);
      newBtn.disabled = false;

    } else {
      // Failed — roll back
      _setProfilePokeBtn(newBtn, false);
      newBtn.disabled = false;
      showToast('Could not send poke. Please try again.', 'error');
    }
  });
}


// ════════════════════════════════════════════════════════════════
// 4.  PROFILE PAGE POKE BUTTON STATE
// ════════════════════════════════════════════════════════════════

/**
 * Set the visual state of the profile page poke button.
 * @param {HTMLElement} btn
 * @param {boolean}     poked
 */
function _setProfilePokeBtn(btn, poked) {
  if (!btn) return;

  const textEl = document.getElementById('poke-btn-text');
  // The btn-poke icon is the <i data-lucide> directly inside #btn-poke
  const iconEl = btn.querySelector('i[data-lucide]');

  if (poked) {
    btn.classList.add('poked');
    btn.setAttribute('aria-label', 'Already poked');
    btn.setAttribute('aria-pressed', 'true');
    if (textEl) textEl.textContent = 'Poked';
    if (iconEl) {
      iconEl.setAttribute('data-lucide', 'zap-off');
      _renderIcons(btn);
    }
  } else {
    btn.classList.remove('poked');
    btn.setAttribute('aria-label', 'Poke this student');
    btn.setAttribute('aria-pressed', 'false');
    if (textEl) textEl.textContent = 'Poke';
    if (iconEl) {
      iconEl.setAttribute('data-lucide', 'zap');
      _renderIcons(btn);
    }
  }
}


// ════════════════════════════════════════════════════════════════
// 5.  HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Increment the poke count displayed in #profile-poke-count.
 * The DB trigger also increments the actual stored value —
 * this just updates the UI without a refetch.
 */
function _incrementPokeCount() {
  const el = document.getElementById('profile-poke-count');
  if (!el) return;
  const current = parseInt(el.textContent, 10) || 0;
  el.textContent = String(current + 1);

  // Brief scale animation to draw attention to the new count
  el.style.transition = 'transform 200ms cubic-bezier(.34,1.56,.64,1)';
  el.style.transform  = 'scale(1.35)';
  setTimeout(() => { el.style.transform = 'scale(1)'; }, 250);
}

/**
 * Replace an element with a clone of itself to remove all existing
 * event listeners. Returns the new element, or null if not found.
 * @param   {HTMLElement} el
 * @returns {HTMLElement|null}
 */
function _replaceWithClone(el) {
  if (!el || !el.parentNode) return el;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  // Re-render Lucide icons in the clone
  _renderIcons(clone);
  return clone;
}

/** Re-render Lucide icons inside an element. */
function _renderIcons(el) {
  if (!window.lucide || !el) return;
  window.lucide.createIcons({ icons: window.lucide.icons, rootElement: el });
}