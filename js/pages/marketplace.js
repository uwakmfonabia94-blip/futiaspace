// js/pages/marketplace.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml } from '../lib/utils.js';
import { showConfirm } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

let currentUserId = null;
let productsPage = 0;
const productsLimit = 10;
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

  main.innerHTML = `
    <div class="marketplace-page">
      <div class="marketplace-header">
        <h2>Marketplace</h2>
        <button class="btn btn-primary btn-sm" id="openAddProductBtn">
          <i data-lucide="plus"></i> Sell Something
        </button>
      </div>
      <div id="marketplaceGrid">
        ${skeletonGrid(6)}
      </div>
      <button id="loadMoreMarketplaceBtn" class="btn btn-secondary" style="margin:16px; display:none;">Load more</button>
    </div>

    <!-- Product form modal -->
    <div id="productFormModal" class="compose-overlay" style="display:none;">
      <div class="product-form-container">
        <div class="product-form-header">
          <h3 id="productFormTitle">Sell Something</h3>
          <button class="compose-cancel-btn" id="closeProductFormBtn"><i data-lucide="x"></i></button>
        </div>
        <form id="productForm" style="flex:1; overflow-y:auto;">
          <input type="hidden" id="productId" />
          <div class="form-group">
            <label for="productTitle">Title *</label>
            <input type="text" id="productTitle" required placeholder="What are you selling?" maxlength="100" />
          </div>
          <div class="form-group">
            <label for="productDescription">Description *</label>
            <textarea id="productDescription" rows="3" required placeholder="Describe the product…" maxlength="300"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group half">
              <label for="productPrice">Price (optional)</label>
              <input type="text" id="productPrice" placeholder="₦5,000" />
            </div>
            <div class="form-group half">
              <label for="productLocation">Location *</label>
              <input type="text" id="productLocation" required placeholder="E.g. Male Hostel" />
            </div>
          </div>
          <div class="form-group">
            <label for="productWhatsApp">WhatsApp Number *</label>
            <input type="tel" id="productWhatsApp" required placeholder="08012345678" maxlength="15" />
          </div>
          <div class="form-group">
            <label for="productStatus">Status</label>
            <select id="productStatus">
              <option value="available">Available</option>
              <option value="sold">Sold</option>
            </select>
          </div>
          <div class="form-group">
            <label>Photos (max 2)</label>
            <div class="product-images-area">
              <div class="product-image-slot" id="imageSlot1">
                <i data-lucide="image"></i>
                <input type="file" id="imageFileInput1" accept="image/*" style="display:none;" />
              </div>
              <div class="product-image-slot" id="imageSlot2">
                <i data-lucide="image"></i>
                <input type="file" id="imageFileInput2" accept="image/*" style="display:none;" />
              </div>
            </div>
          </div>
          <div class="product-form-actions">
            <button type="button" class="btn btn-secondary" id="cancelProductFormBtn">Cancel</button>
            <button type="submit" class="btn btn-primary" id="saveProductBtn">Save</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Crop modal (higher z‑index to sit above product form) -->
    <div id="cropModalMarketplace" class="compose-overlay" style="display:none; z-index:400;">
      <div class="crop-container" style="background:var(--color-surface); padding:16px; border-radius:12px; width:90%; max-width:400px;">
        <h3 style="margin-bottom:12px;">Crop your photo</h3>
        <div style="max-height:300px;">
          <img id="cropImageMarketplace" style="max-width:100%;" />
        </div>
        <div style="margin-top:8px; display:flex; gap:8px;">
          <button type="button" class="btn btn-secondary" id="cancelCropBtnMarketplace">Cancel</button>
          <button type="button" class="btn btn-primary" id="confirmCropBtnMarketplace">Confirm</button>
        </div>
      </div>
    </div>
  `;

  lucide.createIcons({ target: main });

  // ── Attach base events ──
  document.getElementById('openAddProductBtn').addEventListener('click', () => openProductForm());
  document.getElementById('closeProductFormBtn').addEventListener('click', closeProductForm);
  document.getElementById('cancelProductFormBtn').addEventListener('click', closeProductForm);
  document.getElementById('productForm').addEventListener('submit', saveProduct);

  // Image slot click handlers
  setupImageSlots();

  // Crop modal buttons
  document.getElementById('cancelCropBtnMarketplace').addEventListener('click', hideCropModal);
  document.getElementById('confirmCropBtnMarketplace').addEventListener('click', confirmCrop);

  // Load initial products
  await loadProductsPage(0);
  subscribeMarketplaceRealtime();
}

// ── Skeleton grid ──
function skeletonGrid(count) {
  return Array(count).fill(`
    <div class="product-card skeleton">
      <div class="skeleton-img"></div>
      <div class="skeleton-lines">
        <div class="line" style="width:60%;"></div>
        <div class="line" style="width:40%;"></div>
      </div>
    </div>
  `).join('');
}

// ── Load products ──
async function loadProductsPage(page = 0) {
  productsPage = page;
  const offset = page * productsLimit;
  const container = document.getElementById('marketplaceGrid');
  if (!container) return;

  const { data: products, error } = await supabase
    .from('marketplace_items')
    .select('id, user_id, title, description, price, location, status, whatsapp_number, image_url1, image_url2, edited_at, created_at, profiles!inner(full_name, avatar_url)')
    .order('created_at', { ascending: false })
    .range(offset, offset + productsLimit - 1);

  if (error) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">Could not load products.</p>`;
    console.error(error);
    return;
  }

  if (!products || products.length === 0) {
    if (page === 0) container.innerHTML = `<p style="text-align:center;padding:20px;color:var(--color-text-secondary);">No products yet. Be the first to sell something!</p>`;
    const lm = document.getElementById('loadMoreMarketplaceBtn');
    if (lm) lm.style.display = 'none';
    return;
  }

  const html = products.map(product => renderProductCard(product)).join('');
  if (page === 0) container.innerHTML = html;
  else container.insertAdjacentHTML('beforeend', html);

  lucide.createIcons({ target: container });
  attachProductCardEvents();

  const lm = document.getElementById('loadMoreMarketplaceBtn');
  if (lm) lm.style.display = products.length < productsLimit ? 'none' : 'block';
}

function renderProductCard(product) {
  const seller = product.profiles;
  const isOwner = product.user_id === currentUserId;

  // Build images HTML (show both if available)
  const images = [];
  if (product.image_url1) images.push(product.image_url1);
  if (product.image_url2) images.push(product.image_url2);

  let imagesHtml = '';
  if (images.length === 0) {
    // No images – show placeholder
    imagesHtml = `<div class="product-card-img placeholder"><i data-lucide="image" style="width:32px;height:32px;color:var(--color-text-muted);"></i></div>`;
  } else if (images.length === 1) {
    // Single image – full width
    imagesHtml = `<div class="product-card-img-wrapper single"><img src="${escapeHtml(images[0])}" class="product-card-img" onclick="event.stopPropagation(); window.openImageViewer('${escapeHtml(images[0])}')" /></div>`;
  } else {
    // Two images – side‑by‑side
    imagesHtml = `
      <div class="product-card-img-wrapper two">
        <img src="${escapeHtml(images[0])}" class="product-card-img dual" onclick="event.stopPropagation(); window.openImageViewer('${escapeHtml(images[0])}')" />
        <img src="${escapeHtml(images[1])}" class="product-card-img dual" onclick="event.stopPropagation(); window.openImageViewer('${escapeHtml(images[1])}')" />
      </div>
    `;
  }

  // Format price as Nigerian Naira with commas
  let formattedPrice = '';
  if (product.price && !isNaN(parseFloat(product.price))) {
    formattedPrice = '₦' + parseFloat(product.price).toLocaleString('en-NG');
  } else if (product.price) {
    formattedPrice = product.price;
  }

  const editedLabel = product.edited_at ? `<span class="edited-label">(edited)</span>` : '';

  return `
    <div class="product-card" data-product-id="${product.id}">
      ${imagesHtml}
      <div class="product-card-body">
        <div class="product-status-badge ${product.status === 'sold' ? 'sold' : 'available'}">${product.status === 'sold' ? 'SOLD' : 'AVAILABLE'}</div>
        <h4 class="product-title">${escapeHtml(product.title)}</h4>
        <p class="product-description">${escapeHtml(product.description)}</p>
        <div class="product-meta">
          ${formattedPrice ? `<span class="product-price">${escapeHtml(formattedPrice)}</span>` : ''}
          <span class="product-location"><i data-lucide="map-pin" style="width:14px;height:14px;"></i> ${escapeHtml(product.location)}</span>
        </div>
        <div class="product-seller">
          <div class="product-seller-avatar clickable" onclick="window.location.hash='#/profile/${seller.id}'">
            ${getAvatarHtml(seller)}
          </div>
          <span class="product-seller-name clickable" onclick="window.location.hash='#/profile/${seller.id}'">${escapeHtml(seller.full_name)}</span>
          <span class="product-time">${timeAgo(product.created_at)} ${editedLabel}</span>
        </div>
        <div class="product-actions">
          <a href="https://wa.me/${escapeHtml(product.whatsapp_number.replace(/\D/g, ''))}?text=${encodeURIComponent(`Hi, I saw your product "${product.title}" on FutiaSpace. Is it still available?`)}" target="_blank" class="btn btn-sm btn-primary whatsapp-btn">
            <i data-lucide="phone"></i> Contact Seller
          </a>
          ${isOwner ? `
            <div class="product-owner-actions">
              <button class="btn btn-sm btn-secondary edit-product-btn" data-product-id="${product.id}"><i data-lucide="edit-2"></i></button>
              <button class="btn btn-sm btn-danger delete-product-btn" data-product-id="${product.id}"><i data-lucide="trash-2"></i></button>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function attachProductCardEvents() {
  document.querySelectorAll('.edit-product-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const productId = btn.dataset.productId;
      openProductForm(productId);
    });
  });
  document.querySelectorAll('.delete-product-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const productId = btn.dataset.productId;
      const confirmed = await showConfirm('Delete Product', 'Are you sure you want to delete this product?');
      if (confirmed) {
        const { error } = await supabase.from('marketplace_items').delete().eq('id', productId);
        if (error) showToast('Delete failed', 'error');
        else {
          showToast('Product deleted', 'success');
          loadProductsPage(0);
        }
      }
    });
  });
}

// ── Product form (add / edit) ──
async function openProductForm(productId = null) {
  editingProductId = productId;
  const modal = document.getElementById('productFormModal');
  const titleEl = document.getElementById('productFormTitle');
  const form = document.getElementById('productForm');

  form.reset();
  document.getElementById('productId').value = '';
  imageFile1 = null; imageFile2 = null;
  imageBlob1 = null; imageBlob2 = null;
  existingImageUrl1 = ''; existingImageUrl2 = '';
  resetImageSlots();

  if (productId) {
    const { data: product, error } = await supabase
      .from('marketplace_items')
      .select('*')
      .eq('id', productId)
      .single();
    if (error || !product) {
      showToast('Could not load product', 'error');
      return;
    }
    titleEl.textContent = 'Edit Product';
    document.getElementById('productId').value = product.id;
    document.getElementById('productTitle').value = product.title;
    document.getElementById('productDescription').value = product.description;
    document.getElementById('productPrice').value = product.price || '';
    document.getElementById('productLocation').value = product.location;
    document.getElementById('productStatus').value = product.status;
    document.getElementById('productWhatsApp').value = product.whatsapp_number;
    if (product.image_url1) { existingImageUrl1 = product.image_url1; showImageInSlot(1, product.image_url1); }
    if (product.image_url2) { existingImageUrl2 = product.image_url2; showImageInSlot(2, product.image_url2); }
  } else {
    titleEl.textContent = 'Sell Something';
  }

  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('visible'), 10);
}

function closeProductForm() {
  const modal = document.getElementById('productFormModal');
  modal.classList.remove('visible');
  setTimeout(() => { modal.style.display = 'none'; }, 200);
  editingProductId = null;
}

// ── Image slot management ──
function resetImageSlots() {
  const slot1 = document.getElementById('imageSlot1');
  const slot2 = document.getElementById('imageSlot2');
  slot1.innerHTML = `<i data-lucide="image"></i><input type="file" id="imageFileInput1" accept="image/*" style="display:none;" />`;
  slot2.innerHTML = `<i data-lucide="image"></i><input type="file" id="imageFileInput2" accept="image/*" style="display:none;" />`;
  lucide.createIcons({ target: slot1.parentNode });
  setupImageSlots();
}

function showImageInSlot(slot, url) {
  const slotEl = document.getElementById(`imageSlot${slot}`);
  slotEl.innerHTML = `<img src="${escapeHtml(url)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" /><input type="file" id="imageFileInput${slot}" accept="image/*" style="display:none;" />`;
  document.getElementById(`imageFileInput${slot}`).addEventListener('change', (e) => handleImagePick(e, slot));
}

function setupImageSlots() {
  // Attach click on slot to trigger file input
  document.getElementById('imageSlot1').onclick = () => document.getElementById('imageFileInput1')?.click();
  document.getElementById('imageSlot2').onclick = () => document.getElementById('imageFileInput2')?.click();

  document.getElementById('imageFileInput1').onchange = (e) => handleImagePick(e, '1');
  document.getElementById('imageFileInput2').onchange = (e) => handleImagePick(e, '2');
}

function handleImagePick(e, slot) {
  const file = e.target.files[0];
  if (!file) return;
  currentImageSlot = slot;

  const reader = new FileReader();
  reader.onload = (event) => {
    const cropModal = document.getElementById('cropModalMarketplace');
    const cropImg = document.getElementById('cropImageMarketplace');
    cropImg.src = event.target.result;
    cropModal.style.display = 'flex';
    // Force visible class after a tick to allow CSS transition
    setTimeout(() => cropModal.classList.add('visible'), 10);
    cropImg.onload = () => {
      if (cropperMarketplace) cropperMarketplace.destroy();
      cropperMarketplace = new Cropper(cropImg, {
        aspectRatio: 1,
        viewMode: 2,
        autoCropArea: 1,
      });
    };
  };
  reader.readAsDataURL(file);
}

function hideCropModal() {
  const cropModal = document.getElementById('cropModalMarketplace');
  cropModal.classList.remove('visible');
  setTimeout(() => {
    cropModal.style.display = 'none';
    if (cropperMarketplace) { cropperMarketplace.destroy(); cropperMarketplace = null; }
  }, 200);
}

async function confirmCrop() {
  if (!cropperMarketplace) return;
  const canvas = cropperMarketplace.getCroppedCanvas({ width: 512, height: 512 });
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));

  if (currentImageSlot === '1') {
    imageFile1 = new File([blob], 'product1.jpg', { type: 'image/jpeg' });
    imageBlob1 = blob;
    existingImageUrl1 = '';
  } else {
    imageFile2 = new File([blob], 'product2.jpg', { type: 'image/jpeg' });
    imageBlob2 = blob;
    existingImageUrl2 = '';
  }

  // Show preview in the slot
  const slotEl = document.getElementById(`imageSlot${currentImageSlot}`);
  slotEl.innerHTML = `<img src="${URL.createObjectURL(blob)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" /><input type="file" id="imageFileInput${currentImageSlot}" accept="image/*" style="display:none;" />`;
  document.getElementById(`imageFileInput${currentImageSlot}`).onchange = (e) => handleImagePick(e, currentImageSlot);

  hideCropModal();
}

// ── Save product ──
async function saveProduct(e) {
  e.preventDefault();
  const productId = document.getElementById('productId').value;
  const title = document.getElementById('productTitle').value.trim();
  const description = document.getElementById('productDescription').value.trim();
  const price = document.getElementById('productPrice').value.trim();
  const location = document.getElementById('productLocation').value.trim();
  const status = document.getElementById('productStatus').value;
  const whatsapp = document.getElementById('productWhatsApp').value.trim();

  if (!title || !description || !location || !whatsapp) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const saveBtn = document.getElementById('saveProductBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    let imageUrl1 = existingImageUrl1;
    let imageUrl2 = existingImageUrl2;
    const userId = getCurrentUser().id;
    const itemId = productId || crypto.randomUUID();

    if (imageBlob1) {
      const path = `${userId}/${itemId}-1.jpg`;
      await supabase.storage.from('marketplace-images').upload(path, imageBlob1, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from('marketplace-images').getPublicUrl(path);
      imageUrl1 = publicUrl;
    }
    if (imageBlob2) {
      const path = `${userId}/${itemId}-2.jpg`;
      await supabase.storage.from('marketplace-images').upload(path, imageBlob2, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from('marketplace-images').getPublicUrl(path);
      imageUrl2 = publicUrl;
    }

    const productData = {
      title,
      description,
      price: price || null,
      location,
      status,
      whatsapp_number: whatsapp,
      image_url1: imageUrl1 || null,
      image_url2: imageUrl2 || null,
    };

    if (productId) {
      productData.edited_at = new Date().toISOString();
      const { error } = await supabase.from('marketplace_items').update(productData).eq('id', productId);
      if (error) throw error;
      showToast('Product updated!', 'success');
    } else {
      productData.user_id = userId;
      const { error } = await supabase.from('marketplace_items').insert(productData);
      if (error) throw error;
      showToast('Product listed!', 'success');
    }

    closeProductForm();
    loadProductsPage(0);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

// ── Real‑time (placeholder) ──
function subscribeMarketplaceRealtime() {}

document.addEventListener('click', (e) => {
  if (e.target.id === 'loadMoreMarketplaceBtn') {
    loadProductsPage(productsPage + 1);
  }
});

window.addEventListener('hashchange', () => {});