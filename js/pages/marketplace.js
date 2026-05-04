// js/pages/marketplace.js (Fixed - Sell Something button now works)
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml } from '../lib/utils.js';
import { showConfirm } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

let currentUserId = null;
let productsPage = 0;
const productsLimit = 10;
let hasMoreProducts = true;
let isLoadingProducts = false;
let observer = null;
let cropperMarketplace = null;
let currentImageSlot = null;
let imageFile1 = null, imageFile2 = null;
let imageBlob1 = null, imageBlob2 = null;
let existingImageUrl1 = '', existingImageUrl2 = '';
let editingProductId = null;

export async function renderMarketplace() {
  const main = document.getElementById('mainContent');
  if (!main) return;
  const user = getCurrentUser();
  currentUserId = user.id;

  try { await supabase.rpc('delete_old_sold_products'); } catch(e) {}

  main.innerHTML = `
    <div class="marketplace-page">
      <div class="marketplace-header">
        <h2>Marketplace</h2>
        <button class="btn btn-primary btn-sm" id="openAddProductBtn"><i data-lucide="plus"></i> Sell Something</button>
      </div>
      <div id="marketplaceGrid">${skeletonGrid(6)}</div>
      <div id="loadMoreSentinel" style="height:10px;"></div>
    </div>
    <!-- Product form modal -->
    <div id="productFormModal" class="compose-overlay" style="display:none;">
      <div class="product-form-container">
        <div class="product-form-header">
          <h3 id="productFormTitle">Sell Something</h3>
          <button class="compose-cancel-btn" id="closeProductFormBtn"><i data-lucide="x"></i></button>
        </div>
        <form id="productForm">
          <input type="hidden" id="productId" />
          <div class="form-group"><label>Title *</label><input type="text" id="productTitle" required maxlength="100" /></div>
          <div class="form-group"><label>Description *</label><textarea id="productDescription" rows="3" required maxlength="300"></textarea></div>
          <div class="form-row">
            <div class="form-group half"><label>Price (optional)</label><input type="text" id="productPrice" inputmode="numeric" placeholder="Amount" /></div>
            <div class="form-group half"><label>Location *</label><input type="text" id="productLocation" required /></div>
          </div>
          <div class="form-group"><label>WhatsApp Number *</label><input type="tel" id="productWhatsApp" required /></div>
          <div class="form-group"><label>Status</label><select id="productStatus"><option value="available">Available</option><option value="sold">Sold</option></select></div>
          <div class="form-group">
            <label>Photos (max 2)</label>
            <div class="product-images-area">
              <div class="product-image-slot" id="imageSlot1"><i data-lucide="image"></i><input type="file" id="imageFileInput1" accept="image/*" style="display:none;" /></div>
              <div class="product-image-slot" id="imageSlot2"><i data-lucide="image"></i><input type="file" id="imageFileInput2" accept="image/*" style="display:none;" /></div>
            </div>
          </div>
          <div class="product-form-actions">
            <button type="button" class="btn btn-secondary" id="cancelProductFormBtn">Cancel</button>
            <button type="submit" class="btn btn-primary" id="saveProductBtn">Save</button>
          </div>
        </form>
      </div>
    </div>
    <!-- Crop modal -->
    <div id="cropModalMarketplace" class="compose-overlay" style="display:none; z-index:400;">
      <div class="crop-container">
        <h3>Crop photo</h3>
        <div><img id="cropImageMarketplace" style="max-width:100%;" /></div>
        <div style="margin-top:8px; display:flex; gap:8px;">
          <button type="button" class="btn btn-secondary" id="cancelCropBtnMarketplace">Cancel</button>
          <button type="button" class="btn btn-primary" id="confirmCropBtnMarketplace">Confirm</button>
        </div>
      </div>
    </div>
    <!-- Product detail modal -->
    <div id="productDetailModal" class="compose-overlay" style="display:none;">
      <div class="product-form-container" id="productDetailContainer"></div>
    </div>
  `;

  lucide.createIcons({ target: main });
  attachGlobalEventListeners(); // Attach all listeners
  await loadProductsPage(0, true);
  setupInfiniteScroll();
}

function skeletonGrid(count) {
  return Array(count).fill('<div class="product-card skeleton"><div class="skeleton-img"></div><div class="skeleton-lines"><div class="line" style="width:60%;"></div><div class="line" style="width:40%;"></div></div></div>').join('');
}

async function loadProductsPage(page = 0, reset = false) {
  if (isLoadingProducts || (!hasMoreProducts && !reset)) return;
  isLoadingProducts = true;
  const container = document.getElementById('marketplaceGrid');
  if (!container) { isLoadingProducts = false; return; }
  if (reset) { productsPage = 0; hasMoreProducts = true; container.innerHTML = skeletonGrid(6); }

  const offset = page * productsLimit;
  const { data: products, error } = await supabase
    .from('marketplace_items')
    .select('id, user_id, title, description, price, location, status, whatsapp_number, image_url1, image_url2, edited_at, created_at, click_count, profiles(id, full_name, avatar_url, whatsapp_number)')
    .order('created_at', { ascending: false })
    .range(offset, offset + productsLimit - 1);

  if (error || !products || products.length === 0) {
    hasMoreProducts = false;
    if (reset) container.innerHTML = '<p class="empty-text">No products yet.</p>';
    isLoadingProducts = false;
    return;
  }

  const productIds = products.map(p => p.id);
  let viewCountMap = {};
  try {
    const { data: viewCounts } = await supabase.rpc('get_marketplace_view_counts', { product_ids: productIds });
    (viewCounts || []).forEach(row => { viewCountMap[row.product_id] = parseInt(row.view_count); });
  } catch(e) {}

  const html = products.map(p => renderProductCard(p, viewCountMap[p.id] || 0)).join('');
  if (reset || page === 0) container.innerHTML = html;
  else container.insertAdjacentHTML('beforeend', html);

  lucide.createIcons({ target: container });
  attachProductCardEvents(); // Attach events to new product cards
  productsPage = page;
  hasMoreProducts = products.length === productsLimit;
  isLoadingProducts = false;
}

function renderProductCard(product, viewCount) {
  const seller = product.profiles;
  const isOwner = product.user_id === currentUserId;
  const isSold = product.status === 'sold';
  const images = [];
  if (product.image_url1) images.push(product.image_url1);
  if (product.image_url2) images.push(product.image_url2);
  const imagesHtml = images.length === 0
    ? '<div class="product-card-img placeholder"><i data-lucide="image"></i></div>'
    : images.length === 1
      ? `<div class="product-card-img-wrapper single"><img src="${escapeHtml(images[0])}" class="product-card-img" /></div>`
      : `<div class="product-card-img-wrapper two"><img src="${escapeHtml(images[0])}" class="product-card-img dual" /><img src="${escapeHtml(images[1])}" class="product-card-img dual" /></div>`;

  const formattedPrice = product.price && !isNaN(parseFloat(product.price))
    ? '₦' + parseFloat(product.price).toLocaleString('en-NG')
    : product.price || '';
  const editedLabel = product.edited_at ? '<span class="edited-label">(edited)</span>' : '';
  const whatsappLink = (seller?.whatsapp_number)
    ? `<a href="https://wa.me/${seller.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent('Hi, I saw your product "' + product.title + '" on FutiaSpace. Is it still available?')}" target="_blank" class="btn btn-sm btn-primary whatsapp-btn"><i data-lucide="phone"></i> WhatsApp</a>`
    : '';
  
  const chatLink = (!isOwner && !isSold && seller?.id)
    ? `<button class="btn btn-sm btn-secondary chat-product-btn" data-seller-id="${seller.id}" data-product-title="${escapeHtml(product.title)}"><i data-lucide="message-circle"></i> Chat</button>`
    : '';

  const actionHTML = isOwner
    ? `<div class="product-stats-owner"><span><i data-lucide="eye"></i> ${viewCount} views</span><span><i data-lucide="phone"></i> ${product.click_count || 0} contacts</span></div>`
    : (isSold ? '<span class="btn btn-sm btn-secondary" style="pointer-events:none;">Sold Out</span>' : `<div class="product-buttons">${whatsappLink}${chatLink}</div>`);
  
  const ownerButtons = isOwner
    ? `<div class="product-owner-actions">
        <button class="btn btn-sm btn-secondary edit-product-btn" data-product-id="${product.id}"><i data-lucide="edit-2"></i></button>
        <button class="btn btn-sm btn-danger delete-product-btn" data-product-id="${product.id}"><i data-lucide="trash-2"></i></button>
        ${!isSold ? `<button class="btn btn-sm btn-secondary mark-sold-btn" data-product-id="${product.id}"><i data-lucide="check-circle"></i> Sold</button>` : ''}
       </div>`
    : '';

  return `<div class="product-card" data-product-id="${product.id}">
    <div class="product-card-img-wrapper" onclick="openProductDetail('${product.id}')">${imagesHtml}<div class="product-status-badge ${isSold ? 'sold' : 'available'}">${isSold ? 'SOLD' : 'AVAILABLE'}</div></div>
    <div class="product-card-body" onclick="openProductDetail('${product.id}')">
      <h4 class="product-title">${escapeHtml(product.title)}</h4>
      <p class="product-description">${escapeHtml(product.description.substring(0, 60))}${product.description.length > 60 ? '…' : ''}</p>
      <div class="product-meta">${formattedPrice ? `<span class="product-price">${escapeHtml(formattedPrice)}</span>` : ''}<span class="product-location"><i data-lucide="map-pin"></i> ${escapeHtml(product.location)}</span></div>
      <div class="product-seller">
        <div class="product-seller-avatar clickable" onclick="event.stopPropagation(); window.location.hash='#/profile/${seller.id}'">${getAvatarHtml(seller)}</div>
        <span class="product-seller-name clickable" onclick="event.stopPropagation(); window.location.hash='#/profile/${seller.id}'">${escapeHtml(seller.full_name)}</span>
        <span class="product-time">${timeAgo(product.created_at)} ${editedLabel}</span>
      </div>
    </div>
    <div class="product-actions">${actionHTML}${ownerButtons}</div>
  </div>`;
}

window.openProductDetail = async function(productId) {
  const { data: product, error } = await supabase
    .from('marketplace_items')
    .select('*, profiles(id, full_name, avatar_url, whatsapp_number)')
    .eq('id', productId)
    .single();
  if (error || !product) { showToast('Could not load product', 'error'); return; }
  const modal = document.getElementById('productDetailModal');
  const container = document.getElementById('productDetailContainer');
  const seller = product.profiles;
  const isOwner = product.user_id === currentUserId;
  const isSold = product.status === 'sold';
  let formattedPrice = '';
  if (product.price && !isNaN(parseFloat(product.price))) formattedPrice = '₦' + parseFloat(product.price).toLocaleString('en-NG');
  else if (product.price) formattedPrice = product.price;
  let viewCount = 0;
  try {
    const { data: vc } = await supabase.rpc('get_marketplace_view_counts', { product_ids: [product.id] });
    if (vc?.length) viewCount = parseInt(vc[0].view_count);
  } catch(e) {}
  const chatButton = (!isOwner && !isSold && seller?.id)
    ? `<button class="btn btn-primary chat-product-detail" data-seller-id="${seller.id}" style="width:100%; margin-top:12px;"><i data-lucide="message-circle"></i> Chat with ${escapeHtml(seller.full_name)}</button>`
    : '';
  container.innerHTML = `
    <div class="product-form-header">
      <h3>${escapeHtml(product.title)}</h3>
      <button class="compose-cancel-btn" id="closeDetailModalBtn"><i data-lucide="x"></i></button>
    </div>
    <div style="padding:16px;">
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        ${product.image_url1 ? `<img src="${escapeHtml(product.image_url1)}" style="width:48%;border-radius:var(--radius-md);cursor:pointer;" onclick="window.openImageViewer('${escapeHtml(product.image_url1)}')" />` : ''}
        ${product.image_url2 ? `<img src="${escapeHtml(product.image_url2)}" style="width:48%;border-radius:var(--radius-md);cursor:pointer;" onclick="window.openImageViewer('${escapeHtml(product.image_url2)}')" />` : ''}
      </div>
      <p><strong>Description</strong><br>${escapeHtml(product.description)}</p>
      <p><strong>Price:</strong> ${formattedPrice || 'Free'}</p>
      <p><strong>Location:</strong> ${escapeHtml(product.location)}</p>
      <p><strong>Posted:</strong> ${timeAgo(product.created_at)} ${product.edited_at ? '(edited)' : ''}</p>
      <p><strong>Status:</strong> ${isSold ? 'Sold' : 'Available'}</p>
      <div class="product-seller">
        <div class="product-seller-avatar clickable" onclick="window.location.hash='#/profile/${seller.id}'">${getAvatarHtml(seller)}</div>
        <span class="product-seller-name clickable" onclick="window.location.hash='#/profile/${seller.id}'">${escapeHtml(seller.full_name)}</span>
      </div>
      ${isOwner ? `<div class="product-stats-owner"><span><i data-lucide="eye"></i> ${viewCount} views</span><span><i data-lucide="phone"></i> ${product.click_count || 0} contacts</span></div>` : ''}
      ${!isOwner && !isSold && seller?.whatsapp_number ? `<a href="https://wa.me/${seller.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent('Hi, I saw your product "' + product.title + '" on FutiaSpace. Is it still available?')}" target="_blank" class="btn btn-sm btn-primary whatsapp-btn" style="width:100%;"><i data-lucide="phone"></i> WhatsApp</a>` : ''}
      ${chatButton}
    </div>
  `;
  lucide.createIcons({ target: container });
  
  const closeBtn = document.getElementById('closeDetailModalBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('visible');
      setTimeout(() => { modal.style.display = 'none'; }, 200);
    });
  }
  
  const chatDetailBtn = container.querySelector('.chat-product-detail');
  if (chatDetailBtn) {
    chatDetailBtn.addEventListener('click', () => {
      window.location.hash = `#/chat/${seller.id}`;
      modal.classList.remove('visible');
      setTimeout(() => { modal.style.display = 'none'; }, 200);
    });
  }
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('visible');
      setTimeout(() => { modal.style.display = 'none'; }, 200);
    }
  }, { once: true });
  
  try { await supabase.rpc('record_marketplace_view', { viewer_id: currentUserId, product_id: product.id }); } catch(e) {}
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('visible'), 10);
};

function attachProductCardEvents() {
  document.querySelectorAll('.edit-product-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); openProductForm(btn.dataset.productId); }));
  document.querySelectorAll('.delete-product-btn').forEach(btn => btn.addEventListener('click', async (e) => {
    e.stopPropagation(); const confirmed = await showConfirm('Delete', 'Delete product?'); if (confirmed) { await supabase.from('marketplace_items').delete().eq('id', btn.dataset.productId); showToast('Deleted', 'success'); loadProductsPage(0, true); }
  }));
  document.querySelectorAll('.mark-sold-btn').forEach(btn => btn.addEventListener('click', async (e) => {
    e.stopPropagation(); await supabase.from('marketplace_items').update({ status: 'sold', edited_at: new Date().toISOString() }).eq('id', btn.dataset.productId); showToast('Marked sold', 'success'); loadProductsPage(0, true);
  }));
  document.querySelectorAll('.chat-product-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.hash = `#/chat/${btn.dataset.sellerId}`;
  }));
}

function attachGlobalEventListeners() {
  // Use event delegation for the Sell Something button (ensures it works even if re-rendered)
  document.body.addEventListener('click', (e) => {
    const target = e.target.closest('#openAddProductBtn');
    if (target) {
      e.preventDefault();
      openProductForm();
    }
  });

  // Other static buttons (close modals, etc.)
  const closeBtn = document.getElementById('closeProductFormBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeProductForm);
  const cancelBtn = document.getElementById('cancelProductFormBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeProductForm);
  const form = document.getElementById('productForm');
  if (form) form.addEventListener('submit', saveProduct);
  const cancelCrop = document.getElementById('cancelCropBtnMarketplace');
  if (cancelCrop) cancelCrop.addEventListener('click', hideCropModal);
  const confirmCrop = document.getElementById('confirmCropBtnMarketplace');
  if (confirmCrop) confirmCrop.addEventListener('click', confirmCropHandler);
  
  // Image slot handlers
  const slot1 = document.getElementById('imageSlot1');
  const slot2 = document.getElementById('imageSlot2');
  if (slot1) slot1.onclick = () => document.getElementById('imageFileInput1')?.click();
  if (slot2) slot2.onclick = () => document.getElementById('imageFileInput2')?.click();
  const fileInput1 = document.getElementById('imageFileInput1');
  const fileInput2 = document.getElementById('imageFileInput2');
  if (fileInput1) fileInput1.onchange = (e) => handleImagePick(e, '1');
  if (fileInput2) fileInput2.onchange = (e) => handleImagePick(e, '2');
}

async function openProductForm(productId = null) {
  console.log('openProductForm called', productId);
  editingProductId = productId;
  const modal = document.getElementById('productFormModal');
  if (!modal) {
    console.error('Product form modal not found');
    return;
  }
  const form = document.getElementById('productForm');
  form.reset();
  document.getElementById('productId').value = '';
  imageFile1 = null; imageFile2 = null; imageBlob1 = null; imageBlob2 = null;
  existingImageUrl1 = ''; existingImageUrl2 = '';
  resetImageSlots();
  if (!productId) {
    try {
      const { data: profile } = await supabase.from('profiles').select('whatsapp_number').eq('id', currentUserId).single();
      if (profile?.whatsapp_number) document.getElementById('productWhatsApp').value = profile.whatsapp_number;
    } catch(e) {}
  } else {
    const { data: product } = await supabase.from('marketplace_items').select('*').eq('id', productId).single();
    if (!product) { showToast('Could not load product', 'error'); return; }
    document.getElementById('productFormTitle').textContent = 'Edit Product';
    document.getElementById('productId').value = product.id;
    document.getElementById('productTitle').value = product.title;
    document.getElementById('productDescription').value = product.description;
    document.getElementById('productPrice').value = product.price || '';
    document.getElementById('productLocation').value = product.location;
    document.getElementById('productStatus').value = product.status;
    document.getElementById('productWhatsApp').value = product.whatsapp_number;
    if (product.image_url1) { existingImageUrl1 = product.image_url1; showImageInSlot(1, product.image_url1); }
    if (product.image_url2) { existingImageUrl2 = product.image_url2; showImageInSlot(2, product.image_url2); }
  }
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('visible'), 10);
}

function closeProductForm() {
  const modal = document.getElementById('productFormModal');
  if (modal) { modal.classList.remove('visible'); setTimeout(() => { modal.style.display = 'none'; }, 200); }
  editingProductId = null;
}

function resetImageSlots() {
  const slot1 = document.getElementById('imageSlot1');
  const slot2 = document.getElementById('imageSlot2');
  if (slot1) slot1.innerHTML = `<i data-lucide="image"></i><input type="file" id="imageFileInput1" accept="image/*" style="display:none;" />`;
  if (slot2) slot2.innerHTML = `<i data-lucide="image"></i><input type="file" id="imageFileInput2" accept="image/*" style="display:none;" />`;
  lucide.createIcons({ target: document.getElementById('productFormModal') });
  attachGlobalEventListeners(); // re-attach because innerHTML destroyed previous
}

function showImageInSlot(slot, url) {
  const slotEl = document.getElementById(`imageSlot${slot}`);
  slotEl.innerHTML = `<img src="${escapeHtml(url)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" /><input type="file" id="imageFileInput${slot}" accept="image/*" style="display:none;" />`;
  document.getElementById(`imageFileInput${slot}`).onchange = (e) => handleImagePick(e, slot);
}

function handleImagePick(e, slot) {
  const file = e.target.files[0]; if (!file) return;
  currentImageSlot = slot;
  const reader = new FileReader();
  reader.onload = (event) => {
    const cropModal = document.getElementById('cropModalMarketplace');
    const cropImg = document.getElementById('cropImageMarketplace');
    cropImg.src = event.target.result;
    cropModal.style.display = 'flex';
    setTimeout(() => cropModal.classList.add('visible'), 10);
    cropImg.onload = () => {
      if (cropperMarketplace) cropperMarketplace.destroy();
      cropperMarketplace = new Cropper(cropImg, { aspectRatio: 1, viewMode: 2, autoCropArea: 1 });
    };
  };
  reader.readAsDataURL(file);
}

function hideCropModal() {
  const cropModal = document.getElementById('cropModalMarketplace');
  if (!cropModal) return;
  cropModal.classList.remove('visible');
  setTimeout(() => { cropModal.style.display = 'none'; if (cropperMarketplace) { cropperMarketplace.destroy(); cropperMarketplace = null; } }, 200);
}

async function confirmCropHandler() {
  if (!cropperMarketplace) return;
  const canvas = cropperMarketplace.getCroppedCanvas({ width: 512, height: 512 });
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  if (currentImageSlot === '1') { imageFile1 = new File([blob], 'product1.jpg', { type: 'image/jpeg' }); imageBlob1 = blob; existingImageUrl1 = ''; }
  else { imageFile2 = new File([blob], 'product2.jpg', { type: 'image/jpeg' }); imageBlob2 = blob; existingImageUrl2 = ''; }
  const slotEl = document.getElementById(`imageSlot${currentImageSlot}`);
  slotEl.innerHTML = `<img src="${URL.createObjectURL(blob)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" /><input type="file" id="imageFileInput${currentImageSlot}" accept="image/*" style="display:none;" />`;
  document.getElementById(`imageFileInput${currentImageSlot}`).onchange = (e) => handleImagePick(e, currentImageSlot);
  hideCropModal();
}

async function saveProduct(e) {
  e.preventDefault();
  const productId = document.getElementById('productId').value;
  const title = document.getElementById('productTitle').value.trim();
  const description = document.getElementById('productDescription').value.trim();
  const priceRaw = document.getElementById('productPrice').value.trim();
  const price = priceRaw.replace(/\D/g, '');
  const location = document.getElementById('productLocation').value.trim();
  const status = document.getElementById('productStatus').value;
  const whatsapp = document.getElementById('productWhatsApp').value.trim();
  if (!title || !description || !location || !whatsapp) { showToast('Fill all required fields', 'error'); return; }
  const saveBtn = document.getElementById('saveProductBtn');
  saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
  try {
    let imageUrl1 = existingImageUrl1, imageUrl2 = existingImageUrl2;
    const userId = currentUserId;
    const itemId = productId || crypto.randomUUID();
    if (imageBlob1) { const path = `${userId}/${itemId}-1.jpg`; await supabase.storage.from('marketplace-images').upload(path, imageBlob1, { upsert: true }); const u = supabase.storage.from('marketplace-images').getPublicUrl(path); imageUrl1 = u.data.publicUrl; }
    if (imageBlob2) { const path = `${userId}/${itemId}-2.jpg`; await supabase.storage.from('marketplace-images').upload(path, imageBlob2, { upsert: true }); const u = supabase.storage.from('marketplace-images').getPublicUrl(path); imageUrl2 = u.data.publicUrl; }
    const productData = { title, description, price: price || null, location, status, whatsapp_number: whatsapp, image_url1: imageUrl1 || null, image_url2: imageUrl2 || null };
    if (productId) {
      productData.edited_at = new Date().toISOString();
      const { error } = await supabase.from('marketplace_items').update(productData).eq('id', productId);
      if (error) throw error;
      showToast('Product updated', 'success');
    } else {
      productData.user_id = userId;
      const { error } = await supabase.from('marketplace_items').insert(productData);
      if (error) throw error;
      showToast('Product listed', 'success');
    }
    closeProductForm();
    loadProductsPage(0, true);
  } catch (err) { showToast('Error: ' + err.message, 'error'); } finally { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
}

function setupInfiniteScroll() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMoreProducts && !isLoadingProducts) loadProductsPage(productsPage + 1, false);
  }, { threshold: 0.1 });
  const sentinel = document.getElementById('loadMoreSentinel');
  if (sentinel) observer.observe(sentinel);
}

window.loadMarketplaceProducts = loadProductsPage;