/**
 * FutiaSpace — js/directory.js
 *
 * Handles two pages:
 *  ① Home / Directory  (#/home)
 *     • Recently-joined horizontal strip  (last 7 days, same dept+level)
 *     • Student grid with dept + level filter dropdowns
 *     • Infinite scroll via IntersectionObserver
 *     • Skeleton loading → real cards → empty state
 *     • Per-card poke button with optimistic UI
 *
 *  ② Search  (#/search)
 *     • Debounced input (320 ms)
 *     • Filter chips: All | Name | Department | Level
 *     • Clears to initial state when input is empty
 *     • Skeleton → results grid → no-results state
 *
 * Every student name / card is clickable → navigates to #/profile/:id
 */

import { supabase }                        from './supabase.js';
import { navigate, getCurrentProfile }     from './router.js';
import {
  showToast,
  renderAvatar,
  escapeHtml,
  formatLevel,
  debounce,
}                                          from './utils.js';
import { pokeUser, getPokesISent }         from './poke.js';


// ════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════
const PAGE_SIZE        = 12;   // cards per infinite-scroll page
const RJ_LIMIT         = 15;   // max recently-joined cards
const SEARCH_MIN_CHARS = 1;    // trigger search after 1+ char
const RECENTLY_JOINED_DAYS = 7;


// ════════════════════════════════════════════════════════════════
// MODULE STATE
// ════════════════════════════════════════════════════════════════
let _observer         = null;  // IntersectionObserver for infinite scroll
let _dirPage          = 0;     // current page index (0-based)
let _dirLoading       = false; // guard against concurrent fetches
let _dirDone          = false; // true when all pages are loaded
let _dirDept          = '';    // active department filter value
let _dirLevel         = '';    // active level filter value

let _searchFilter     = 'all'; // active search chip
let _lastSearchQuery  = '';    // debounce dedup

/** Poke status cache: Set of profile IDs the current user has already poked. */
let _pokedIds         = new Set();


// ════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════

/** Called by router.js when #/home becomes active. */
export function initDirectory() {
  _resetDirState();
  _wireFilters();
  _loadRecentlyJoined();
  _loadDirectoryPage(true);   // true = first load (show skeletons)
  _initIntersectionObserver();
}

/** Called by router.js just before navigating away from #/home. */
export function destroyDirectory() {
  if (_observer) {
    _observer.disconnect();
    _observer = null;
  }
}

/** Called by router.js when #/search becomes active. */
export function initSearch() {
  _wireSearch();
  _wireSearchBackButton();
  // Auto-focus the search input when the page opens
  requestAnimationFrame(() => {
    document.getElementById('search-input')?.focus();
  });
}


// ════════════════════════════════════════════════════════════════
// 1.  DIRECTORY — STATE RESET
// ════════════════════════════════════════════════════════════════
function _resetDirState() {
  _dirPage    = 0;
  _dirLoading = false;
  _dirDone    = false;
  _dirDept    = document.getElementById('filter-department')?.value || '';
  _dirLevel   = document.getElementById('filter-level')?.value     || '';

  // Clear existing cards (keep skeleton placeholders for first load)
  const grid = document.getElementById('student-grid');
  if (grid) grid.innerHTML = _buildSkeletonCards(PAGE_SIZE);

  // Hide empty state
  _setVisible('dir-empty-state', false);

  // Update context label
  _updateContextLabel(_dirDept, _dirLevel);

  // Render Lucide icons in the freshly injected skeletons
  _renderIcons('student-grid');
}


// ════════════════════════════════════════════════════════════════
// 2.  DIRECTORY — FILTER WIRING
// ════════════════════════════════════════════════════════════════
function _wireFilters() {
  const deptSel  = document.getElementById('filter-department');
  const levelSel = document.getElementById('filter-level');

  deptSel?.addEventListener('change', () => {
    _dirDept = deptSel.value;
    _resetAndReload();
  });

  levelSel?.addEventListener('change', () => {
    _dirLevel = levelSel.value;
    _resetAndReload();
  });
}

function _resetAndReload() {
  if (_observer) { _observer.disconnect(); _observer = null; }
  _dirPage    = 0;
  _dirLoading = false;
  _dirDone    = false;

  const grid = document.getElementById('student-grid');
  if (grid) grid.innerHTML = _buildSkeletonCards(PAGE_SIZE);

  _setVisible('dir-empty-state', false);
  _updateContextLabel(_dirDept, _dirLevel);
  _loadDirectoryPage(false);
  _initIntersectionObserver();
}

function _updateContextLabel(dept, level) {
  const el = document.getElementById('dir-context-label');
  if (!el) return;
  if (!dept && !level) { el.textContent = 'All Students'; return; }
  const parts = [];
  if (dept)  parts.push(dept);
  if (level) parts.push(formatLevel(level));
  el.textContent = parts.join(' · ');
}


// ════════════════════════════════════════════════════════════════
// 3.  DIRECTORY — DATA FETCHING
// ════════════════════════════════════════════════════════════════
async function _loadDirectoryPage(isFirstLoad = false) {
  if (_dirLoading || _dirDone) return;
  _dirLoading = true;

  const me = getCurrentProfile();

  // If not first load, show a small scroll loader at the bottom
  if (!isFirstLoad) _appendScrollLoader();

  try {
    const from = _dirPage * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let query = supabase
      .from('profiles')
      .select('id, full_name, department, level, gender, avatar_url, poke_count')
      .order('created_at', { ascending: false })
      .range(from, to);

    // Apply active filters
    if (_dirDept)  query = query.eq('department', _dirDept);
    if (_dirLevel) query = query.eq('level', _dirLevel);

    const { data, error } = await query;

    _removeScrollLoader();

    if (error) {
      _dirLoading = false;
      showToast('Could not load students. Please try again.', 'error');
      return;
    }

    const profiles = data || [];

    // Fetch which of these I've already poked (batch query)
    const newPokedIds = await getPokesISent(profiles.map(p => p.id));
    newPokedIds.forEach(id => _pokedIds.add(id));

    // On first load, replace skeletons; otherwise append
    const grid = document.getElementById('student-grid');
    if (!grid) { _dirLoading = false; return; }

    if (isFirstLoad || _dirPage === 0) {
      grid.innerHTML = '';
    }

    if (profiles.length === 0 && _dirPage === 0) {
      _setVisible('dir-empty-state', true);
      _dirDone    = true;
      _dirLoading = false;
      return;
    }

    // Build and append cards
    profiles.forEach(profile => {
      if (me && profile.id === me.id) return; // skip own card
      const card = _buildStudentCard(profile, _pokedIds.has(profile.id));
      grid.appendChild(card);
    });

    // If fewer than PAGE_SIZE returned, we've hit the end
    if (profiles.length < PAGE_SIZE) _dirDone = true;

    _dirPage++;
    _dirLoading = false;

  } catch (err) {
    _removeScrollLoader();
    _dirLoading = false;
    console.error('[directory] load error:', err);
    showToast('Something went wrong. Please try again.', 'error');
  }
}


// ════════════════════════════════════════════════════════════════
// 4.  INFINITE SCROLL
// ════════════════════════════════════════════════════════════════
function _initIntersectionObserver() {
  const sentinel = document.getElementById('scroll-sentinel');
  if (!sentinel) return;

  _observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !_dirLoading && !_dirDone) {
        _loadDirectoryPage(false);
      }
    },
    {
      root      : document.getElementById('main-content'),
      rootMargin: '200px',   // start loading 200px before sentinel is visible
      threshold : 0,
    }
  );

  _observer.observe(sentinel);
}


// ════════════════════════════════════════════════════════════════
// 5.  RECENTLY JOINED
// ════════════════════════════════════════════════════════════════
async function _loadRecentlyJoined() {
  const listEl  = document.getElementById('recently-joined-list');
  const emptyEl = document.getElementById('recently-joined-empty');
  const me      = getCurrentProfile();

  if (!listEl) return;

  // Show skeletons (already in HTML from Phase 2)
  // They stay until we inject real cards or empty state

  try {
    const sevenDaysAgo = new Date(
      Date.now() - RECENTLY_JOINED_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    let query = supabase
      .from('profiles')
      .select('id, full_name, avatar_url, department, level')
      .gt('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(RJ_LIMIT);

    // Only show coursemates from same dept + level as current user
    if (me?.department) query = query.eq('department', me.department);
    if (me?.level)      query = query.eq('level',      me.level);

    const { data, error } = await query;

    // Clear skeleton items
    listEl.innerHTML = '';

    if (error || !data || data.length === 0) {
      // No recently joined or query failed — show empty message
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    // Filter out the logged-in user themselves
    const others = data.filter(p => !me || p.id !== me.id);

    if (others.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    others.forEach(profile => {
      const card = _buildRJCard(profile);
      listEl.appendChild(card);
    });

  } catch (err) {
    console.error('[directory] recently joined error:', err);
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
  }
}


// ════════════════════════════════════════════════════════════════
// 6.  CARD BUILDERS
// ════════════════════════════════════════════════════════════════

/**
 * Build a student grid card element.
 * @param  {Object}  profile   Row from the profiles table.
 * @param  {boolean} alreadyPoked  Whether the current user has poked this person.
 * @returns {HTMLElement}
 */
function _buildStudentCard(profile, alreadyPoked) {
  const card = document.createElement('div');
  card.className  = 'student-card';
  card.setAttribute('role', 'listitem');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `View ${escapeHtml(profile.full_name)}'s profile`);
  card.dataset.id = profile.id;

  // ── Avatar ──────────────────────────────────────────────────
  const avatarHtml = profile.avatar_url
    ? `<img
          src="${escapeHtml(profile.avatar_url)}"
          alt="${escapeHtml(profile.full_name)}"
          class="sc-avatar-img"
          loading="lazy"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
        >
        <div class="sc-initials" style="display:none" aria-hidden="true">
          ${_initials(profile.full_name)}
        </div>`
    : `<div class="sc-initials" aria-hidden="true">${_initials(profile.full_name)}</div>`;

  // ── Poke button label ────────────────────────────────────────
  const pokeLabel = alreadyPoked ? 'Poked' : 'Poke';
  const pokeClass = alreadyPoked ? 'sc-poke-btn poked' : 'sc-poke-btn';
  const pokeIcon  = alreadyPoked ? 'zap-off' : 'zap';

  card.innerHTML = `
    <div class="sc-avatar-wrap">
      ${avatarHtml}
    </div>
    <p class="sc-name">${escapeHtml(profile.full_name)}</p>
    <p class="sc-dept">${escapeHtml(profile.department)}</p>
    <div class="sc-tags">
      <span class="tag tag-level">${escapeHtml(formatLevel(profile.level))}</span>
    </div>
    <button
      type="button"
      class="${pokeClass}"
      data-profile-id="${profile.id}"
      aria-label="${pokeLabel} ${escapeHtml(profile.full_name)}"
      aria-pressed="${alreadyPoked}"
    >
      <i data-lucide="${pokeIcon}" aria-hidden="true"></i>
      <span>${pokeLabel}</span>
    </button>
  `;

  // ── Card click → profile page ────────────────────────────────
  card.addEventListener('click', (e) => {
    // Don't navigate if the poke button itself was clicked
    if (e.target.closest('.sc-poke-btn')) return;
    navigate(`#/profile/${profile.id}`);
  });

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`#/profile/${profile.id}`);
    }
  });

  // ── Poke button click ────────────────────────────────────────
  const pokeBtn = card.querySelector('.sc-poke-btn');
  pokeBtn?.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent card click
    _handleCardPoke(profile.id, profile.full_name, pokeBtn);
  });

  // Render Lucide icon in the card
  _renderIcons(card);

  return card;
}

/**
 * Build a recently-joined mini card for the horizontal strip.
 * @param  {Object} profile
 * @returns {HTMLElement}
 */
function _buildRJCard(profile) {
  const card = document.createElement('div');
  card.className  = 'rj-card';
  card.setAttribute('role', 'listitem');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `View ${escapeHtml(profile.full_name)}'s profile`);

  const avatarHtml = profile.avatar_url
    ? `<img
          src="${escapeHtml(profile.avatar_url)}"
          alt="${escapeHtml(profile.full_name)}"
          loading="lazy"
          style="width:100%;height:100%;object-fit:cover;border-radius:9999px;"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
        >
        <div class="rj-avatar-initials" style="display:none" aria-hidden="true">
          ${_initials(profile.full_name)}
        </div>`
    : `<div class="rj-avatar-initials" aria-hidden="true">${_initials(profile.full_name)}</div>`;

  card.innerHTML = `
    <div class="rj-avatar">${avatarHtml}</div>
    <span class="rj-name">${escapeHtml(_firstName(profile.full_name))}</span>
  `;

  card.addEventListener('click', () => navigate(`#/profile/${profile.id}`));
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`#/profile/${profile.id}`);
    }
  });

  return card;
}


// ════════════════════════════════════════════════════════════════
// 7.  POKE HANDLER ON DIRECTORY CARDS
//     Optimistic UI: update button immediately, roll back on failure
// ════════════════════════════════════════════════════════════════
async function _handleCardPoke(profileId, fullName, btn) {
  if (!btn) return;

  const alreadyPoked = btn.classList.contains('poked');
  if (alreadyPoked) return; // poke is one-way — can't un-poke from directory

  // Optimistic UI — flip button immediately
  _setPokeButtonState(btn, true, fullName);
  _pokedIds.add(profileId);

  const { success, alreadyPoked: serverAlready } = await pokeUser(profileId);

  if (!success && !serverAlready) {
    // Roll back
    _setPokeButtonState(btn, false, fullName);
    _pokedIds.delete(profileId);
    showToast('Could not send poke. Please try again.', 'error');
  } else {
    showToast(`You poked ${_firstName(fullName)}!`, 'success', 2000);
  }
}

function _setPokeButtonState(btn, poked, fullName) {
  if (!btn) return;
  const name = _firstName(fullName);

  btn.classList.toggle('poked', poked);
  btn.setAttribute('aria-pressed', String(poked));
  btn.setAttribute('aria-label',   poked ? `Poked ${name}` : `Poke ${name}`);

  const iconEl = btn.querySelector('i[data-lucide]');
  const spanEl = btn.querySelector('span');

  if (iconEl) {
    iconEl.setAttribute('data-lucide', poked ? 'zap-off' : 'zap');
    _renderIcons(btn);
  }
  if (spanEl) spanEl.textContent = poked ? 'Poked' : 'Poke';
}


// ════════════════════════════════════════════════════════════════
// 8.  SEARCH
// ════════════════════════════════════════════════════════════════
function _wireSearch() {
  const input    = document.getElementById('search-input');
  const clearBtn = document.getElementById('btn-clear-search');
  const chips    = document.querySelectorAll('[data-search-filter]');

  if (!input) return;

  // If search was already wired (navigated back), don't double-wire
  if (input.dataset.wired) return;
  input.dataset.wired = '1';

  // Filter chips
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('chip-active'));
      chip.classList.add('chip-active');
      _searchFilter = chip.dataset.searchFilter;
      // Re-run the current query with the new filter
      const q = input.value.trim();
      if (q.length >= SEARCH_MIN_CHARS) _runSearch(q);
    });
  });

  // Debounced input handler
  const debouncedSearch = debounce((q) => {
    if (q.length >= SEARCH_MIN_CHARS) {
      _runSearch(q);
    } else {
      _showSearchState('initial');
    }
  }, 320);

  input.addEventListener('input', () => {
    const q = input.value.trim();
    // Show / hide clear button
    if (clearBtn) clearBtn.classList.toggle('hidden', q.length === 0);
    // Show initial state instantly when cleared
    if (q.length === 0) {
      _showSearchState('initial');
      _lastSearchQuery = '';
      return;
    }
    debouncedSearch(q);
  });

  // Clear button
  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    _showSearchState('initial');
    _lastSearchQuery = '';
    input.focus();
  });
}

function _wireSearchBackButton() {
  const btn = document.getElementById('btn-back-from-search');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else navigate('#/home');
  });
}

async function _runSearch(query) {
  if (query === _lastSearchQuery) return;
  _lastSearchQuery = query;

  const grid = document.getElementById('search-grid');
  if (!grid) return;

  // Show skeletons while loading
  grid.innerHTML = _buildSkeletonCards(6);
  _showSearchState('loading');

  try {
    const me = getCurrentProfile();
    let data = [];
    let error = null;

    const trimmed = query.trim();

    if (_searchFilter === 'level') {
      // Level filter: match exactly (e.g. "100", "200", "300")
      // Also handle "100 level" input gracefully
      const levelNum = trimmed.replace(/\D/g, '').slice(0, 3);
      if (!levelNum) {
        grid.innerHTML = '';
        _showSearchState('empty');
        return;
      }
      ({ data, error } = await supabase
        .from('profiles')
        .select('id, full_name, department, level, gender, avatar_url, poke_count')
        .eq('level', levelNum)
        .order('created_at', { ascending: false })
        .limit(40));

    } else if (_searchFilter === 'department') {
      ({ data, error } = await supabase
        .from('profiles')
        .select('id, full_name, department, level, gender, avatar_url, poke_count')
        .ilike('department', `%${trimmed}%`)
        .order('created_at', { ascending: false })
        .limit(40));

    } else if (_searchFilter === 'name') {
      ({ data, error } = await supabase
        .from('profiles')
        .select('id, full_name, department, level, gender, avatar_url, poke_count')
        .ilike('full_name', `%${trimmed}%`)
        .order('created_at', { ascending: false })
        .limit(40));

    } else {
      // "all" — search across name AND department in parallel, merge + dedupe
      const [nameRes, deptRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, department, level, gender, avatar_url, poke_count')
          .ilike('full_name', `%${trimmed}%`)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('profiles')
          .select('id, full_name, department, level, gender, avatar_url, poke_count')
          .ilike('department', `%${trimmed}%`)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      error = nameRes.error || deptRes.error;
      if (!error) {
        const seen = new Set();
        data = [];
        [...(nameRes.data || []), ...(deptRes.data || [])].forEach(p => {
          if (!seen.has(p.id)) { seen.add(p.id); data.push(p); }
        });
      }
    }

    // Bail if a newer search has already started
    if (query !== _lastSearchQuery) return;

    grid.innerHTML = '';

    if (error) {
      _showSearchState('initial');
      showToast('Search failed. Please try again.', 'error');
      return;
    }

    // Filter out the current user from results
    const results = (data || []).filter(p => !me || p.id !== me.id);

    if (results.length === 0) {
      _showSearchState('empty');
      return;
    }

    // Fetch poke status for results
    const pokedInResults = await getPokesISent(results.map(p => p.id));
    pokedInResults.forEach(id => _pokedIds.add(id));

    results.forEach(profile => {
      const card = _buildStudentCard(profile, _pokedIds.has(profile.id));
      grid.appendChild(card);
    });

    _showSearchState('results');

  } catch (err) {
    console.error('[directory] search error:', err);
    if (query !== _lastSearchQuery) return;
    grid.innerHTML = '';
    _showSearchState('initial');
    showToast('Something went wrong. Please try again.', 'error');
  }
}

/**
 * Toggle search page visibility states.
 * @param {'initial'|'loading'|'results'|'empty'} state
 */
function _showSearchState(state) {
  const grid         = document.getElementById('search-grid');
  const initialState = document.getElementById('search-initial-state');
  const emptyState   = document.getElementById('search-empty-state');

  // Hide all first
  if (initialState) initialState.classList.add('hidden');
  if (emptyState)   emptyState.classList.add('hidden');

  switch (state) {
    case 'initial':
      if (grid)         grid.innerHTML = '';
      if (initialState) initialState.classList.remove('hidden');
      break;
    case 'loading':
      // grid already has skeletons injected before calling this
      break;
    case 'results':
      // grid has cards — nothing extra to do
      break;
    case 'empty':
      if (grid)       grid.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      break;
  }
}


// ════════════════════════════════════════════════════════════════
// 9.  SKELETON HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Build N skeleton card HTML strings.
 * The inner elements match the CSS shimmer rules in components.css.
 */
function _buildSkeletonCards(n) {
  const card = `
    <div class="student-card-skeleton" aria-hidden="true">
      <div class="sk-avatar skeleton-base"></div>
      <div class="sk-line  skeleton-base"></div>
      <div class="sk-line-sm skeleton-base"></div>
      <div class="sk-btn  skeleton-base"></div>
    </div>`;
  return Array(n).fill(card).join('');
}


// ════════════════════════════════════════════════════════════════
// 10.  SCROLL LOADER  (dots at bottom during pagination fetch)
// ════════════════════════════════════════════════════════════════
function _appendScrollLoader() {
  const grid = document.getElementById('student-grid');
  if (!grid) return;
  if (document.getElementById('_scroll-loader')) return;

  const loader = document.createElement('div');
  loader.id = '_scroll-loader';
  // Span across both columns
  loader.style.cssText = 'grid-column:1/-1;';
  loader.innerHTML = `
    <div class="scroll-loader">
      <div class="scroll-loader-dot"></div>
      <div class="scroll-loader-dot"></div>
      <div class="scroll-loader-dot"></div>
    </div>`;
  grid.appendChild(loader);
}

function _removeScrollLoader() {
  document.getElementById('_scroll-loader')?.remove();
}


// ════════════════════════════════════════════════════════════════
// 11.  UTILITY HELPERS
// ════════════════════════════════════════════════════════════════

/** Show or hide an element by ID. */
function _setVisible(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  if (visible) el.classList.remove('hidden');
  else         el.classList.add('hidden');
}

/** Derive 1–2 uppercase initials. */
function _initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Get just the first word of a name for compact display. */
function _firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || name;
}

/**
 * Re-render Lucide icons inside an element (or element ID string).
 * @param {HTMLElement|string} target
 */
function _renderIcons(target) {
  if (!window.lucide) return;
  const el = typeof target === 'string'
    ? document.getElementById(target)
    : target;
  if (el) window.lucide.createIcons({ icons: window.lucide.icons, rootElement: el });
}