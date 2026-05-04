// js/pages/search.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, getAvatarHtml } from '../lib/utils.js';
import { navigate } from '../router.js';

export async function renderSearch() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  main.innerHTML = `
    <div class="search-page">
      <div class="search-header">
        <div class="search-input-wrapper">
          <i data-lucide="search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-muted); width:18px; height:18px;"></i>
          <input type="text" id="searchField" placeholder="Search people or products..." class="search-page-input" autofocus />
          <button id="clearSearchBtn" class="search-clear-btn" style="display:none;">
            <i data-lucide="x" style="width:16px; height:16px;"></i>
          </button>
        </div>
        <button id="closeSearchBtn" class="btn btn-sm btn-secondary" style="padding:6px 10px;">
          <i data-lucide="arrow-left"></i>
        </button>
      </div>

      <!-- Recent Searches -->
      <div id="recentSearches" class="search-section">
        <h4>Recent Searches</h4>
        <div id="recentList" class="recent-list"></div>
      </div>

      <!-- Results -->
      <div id="searchResults" class="search-section" style="display:none;">
        <div id="peopleResults"></div>
        <div id="productResults"></div>
      </div>
    </div>
  `;

  lucide.createIcons({ target: main });

  const searchField = document.getElementById('searchField');
  const clearBtn = document.getElementById('clearSearchBtn');
  const closeBtn = document.getElementById('closeSearchBtn');

  // Recent searches from localStorage
  const recentSearches = JSON.parse(localStorage.getItem('futiaspace-recentSearches') || '[]');
  renderRecentSearches(recentSearches);

  // Close search
  closeBtn.addEventListener('click', () => {
    window.history.back(); // go back to whatever page was open before
  });

  // Clear button
  clearBtn.addEventListener('click', () => {
    searchField.value = '';
    clearBtn.style.display = 'none';
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('recentSearches').style.display = 'block';
    searchField.focus();
  });

  // Input events
  searchField.addEventListener('input', () => {
    clearBtn.style.display = searchField.value.trim().length > 0 ? 'block' : 'none';
    const query = searchField.value.trim();
    if (query.length >= 2) {
      performSearch(query);
    } else {
      document.getElementById('searchResults').style.display = 'none';
      document.getElementById('recentSearches').style.display = 'block';
    }
  });

  // Perform search on Enter
  searchField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = searchField.value.trim();
      if (query.length >= 2) {
        saveRecentSearch(query);
        performSearch(query);
      }
    }
  });

  // Click on recent search item
  document.getElementById('recentSearches').addEventListener('click', (e) => {
    const item = e.target.closest('.recent-item');
    if (item) {
      const query = item.textContent.trim();
      searchField.value = query;
      clearBtn.style.display = 'block';
      saveRecentSearch(query);
      performSearch(query);
    }
  });
}

function renderRecentSearches(searches) {
  const container = document.getElementById('recentList');
  if (!container) return;
  if (searches.length === 0) {
    container.innerHTML = '<p class="empty-text">No recent searches</p>';
    return;
  }
  container.innerHTML = searches.map(q => `<span class="recent-item">${escapeHtml(q)}</span>`).join('');
}

function saveRecentSearch(query) {
  let recent = JSON.parse(localStorage.getItem('futiaspace-recentSearches') || '[]');
  recent = recent.filter(q => q !== query);
  recent.unshift(query);
  if (recent.length > 8) recent.pop();
  localStorage.setItem('futiaspace-recentSearches', JSON.stringify(recent));
  renderRecentSearches(recent);
}

async function performSearch(query) {
  document.getElementById('recentSearches').style.display = 'none';
  document.getElementById('searchResults').style.display = 'block';

  const peopleContainer = document.getElementById('peopleResults');
  const productContainer = document.getElementById('productResults');

  // Parallel search
  const [peopleRes, productRes] = await Promise.all([
    supabase.from('profiles')
      .select('id, full_name, department, level, avatar_url')
      .ilike('full_name', `%${query}%`)
      .limit(10),
    supabase.from('marketplace_items')
      .select('id, title, price, image_url1, image_url2')
      .ilike('title', `%${query}%`)
      .eq('status', 'available')
      .limit(10)
  ]);

  const people = peopleRes.data || [];
  const products = productRes.data || [];

  peopleContainer.innerHTML = `
    <h4>People (${people.length})</h4>
    ${people.length === 0 ? '<p class="empty-text">No people found</p>' : people.map(p => `
      <div class="search-result-item" onclick="window.location.hash='#/profile/${p.id}'">
        <div class="search-avatar">${getAvatarHtml(p)}</div>
        <div>
          <strong>${escapeHtml(p.full_name)}</strong>
          <span>${escapeHtml(p.department)} · ${p.level}L</span>
        </div>
      </div>
    `).join('')}
  `;

  productContainer.innerHTML = `
    <h4 style="margin-top:20px;">Marketplace (${products.length})</h4>
    ${products.length === 0 ? '<p class="empty-text">No products found</p>' : products.map(p => {
      const img = p.image_url1 || p.image_url2;
      return `
        <div class="search-result-item" onclick="window.location.hash='#/marketplace'">
          ${img ? `<img src="${escapeHtml(img)}" class="search-product-img" />` : '<div class="avatar-placeholder" style="width:36px;height:36px;">🛒</div>'}
          <div>
            <strong>${escapeHtml(p.title)}</strong>
            <span>${p.price ? '₦' + parseFloat(p.price).toLocaleString('en-NG') : 'Contact'}</span>
          </div>
        </div>
      `;
    }).join('')}
  `;

  lucide.createIcons({ target: document.getElementById('searchResults') });
}