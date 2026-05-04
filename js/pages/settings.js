// js/pages/settings.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { showToast } from '../ui/toast.js';

export async function renderSettings() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  const user = getCurrentUser();
  const userId = user.id;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, department, level, gender, bio, avatar_url, avatar_path, whatsapp_number, referral_code')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    main.innerHTML = `<div style="padding:20px;">Profile not found.</div>`;
    return;
  }

  main.innerHTML = `
    <div class="settings-page">
      <h2 style="padding:16px;">Edit Profile</h2>
      <form id="settingsForm" style="padding:0 16px;">
        <div class="form-group">
          <label>Profile Photo</label>
          <div class="avatar-upload" id="avatarContainer">
            ${profile.avatar_url ? `<img src="${escapeHtml(profile.avatar_url)}" id="profileAvatarPreview" class="avatar-img-large" />` : `<div class="avatar-placeholder-large">${getInitials(profile.full_name)}</div>`}
            <button type="button" class="btn btn-secondary" id="changeAvatarBtn">Change Photo</button>
          </div>
        </div>
        <div class="form-group">
          <label for="fullName">Full Name</label>
          <input type="text" id="fullName" value="${escapeHtml(profile.full_name)}" />
        </div>
        <div class="form-group">
          <label for="department">Department</label>
          <select id="department" class="form-select" disabled>
            <!-- populated dynamically -->
          </select>
          <small style="color:var(--text-muted);">Department cannot be changed after signup.</small>
        </div>
        <div class="form-group">
          <label for="level">Level</label>
          <select id="level">
            <option value="100" ${profile.level === '100' ? 'selected' : ''}>100</option>
            <option value="200" ${profile.level === '200' ? 'selected' : ''}>200</option>
            <option value="300" ${profile.level === '300' ? 'selected' : ''}>300</option>
          </select>
        </div>
        <div class="form-group">
          <label for="gender">Gender</label>
          <select id="gender" disabled>
            <option value="Male" ${profile.gender === 'Male' ? 'selected' : ''}>Male</option>
            <option value="Female" ${profile.gender === 'Female' ? 'selected' : ''}>Female</option>
          </select>
          <small style="color:var(--text-muted);">Gender cannot be changed after signup.</small>
        </div>
        <div class="form-group">
          <label for="bio">Bio</label>
          <textarea id="bio" rows="3">${escapeHtml(profile.bio || '')}</textarea>
        </div>
        <div class="form-group">
          <label for="whatsapp">WhatsApp Number (optional)</label>
          <input type="tel" id="whatsapp" placeholder="+234 801 234 5678" value="${escapeHtml(profile.whatsapp_number || '')}" />
        </div>

        <!-- Referral code -->
        ${profile.referral_code ? `
          <div class="form-group">
            <label>Your Referral Link</label>
            <div style="display:flex; gap:8px;">
              <input type="text" readonly value="https://futiaspace.com.ng/#/signup?ref=${escapeHtml(profile.referral_code)}" id="referralLink" style="flex:1;" />
              <button type="button" class="btn btn-sm btn-secondary" id="copyReferralBtn"><i data-lucide="copy"></i></button>
            </div>
          </div>
        ` : ''}

        <button type="submit" class="btn btn-primary" id="saveBtn">Save Changes</button>
      </form>

      <!-- Hidden file input and cropper modal -->
      <input type="file" id="avatarFileInput" accept="image/*" style="display:none" />
      <div id="cropModal" class="compose-overlay" style="display:none;">
        <div class="crop-container" style="background:var(--color-surface); padding:16px; border-radius:12px; width:90%; max-width:400px;">
          <h3 style="margin-bottom:12px;">Crop your photo</h3>
          <div style="max-height:300px;">
            <img id="cropImage" style="max-width:100%;" />
          </div>
          <div style="margin-top:8px; display:flex; gap:8px;">
            <button type="button" class="btn btn-secondary" id="cancelCropBtn">Cancel</button>
            <button type="button" class="btn btn-primary" id="cropConfirmBtn">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  `;

  lucide.createIcons({ target: main });

  // Load departments dropdown (disabled just to show current)
  loadDepartmentsDropdown(profile.department);

  // Avatar change logic
  const fileInput = document.getElementById('avatarFileInput');
  const changeBtn = document.getElementById('changeAvatarBtn');
  const cropModal = document.getElementById('cropModal');
  const cropImage = document.getElementById('cropImage');
  const cancelCropBtn = document.getElementById('cancelCropBtn');
  const confirmCropBtn = document.getElementById('cropConfirmBtn');
  let cropper = null;

  changeBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      cropImage.src = event.target.result;
      cropModal.style.display = 'flex';
      cropImage.onload = () => {
        if (cropper) cropper.destroy();
        cropper = new Cropper(cropImage, { aspectRatio: 1, viewMode: 2, autoCropArea: 1 });
      };
    };
    reader.readAsDataURL(file);
  });

  cancelCropBtn.addEventListener('click', () => {
    cropModal.style.display = 'none';
    if (cropper) cropper.destroy();
    fileInput.value = '';
  });

  confirmCropBtn.addEventListener('click', async () => {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({ width: 256, height: 256 });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    const path = `${userId}/avatar.jpg`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true });
    if (uploadError) { showToast('Upload failed: ' + uploadError.message, 'error'); return; }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl, avatar_path: path }).eq('id', userId);
    if (updateError) { showToast('Failed to update profile: ' + updateError.message, 'error'); return; }

    // Update preview
    const preview = document.getElementById('profileAvatarPreview');
    const placeholderDiv = document.querySelector('.avatar-placeholder-large');
    if (preview) preview.src = publicUrl;
    else if (placeholderDiv) placeholderDiv.outerHTML = `<img src="${publicUrl}" id="profileAvatarPreview" class="avatar-img-large" />`;

    cropModal.style.display = 'none';
    cropper.destroy();
    fileInput.value = '';
    showToast('Photo updated!', 'success');
  });

  // Copy referral link
  if (profile.referral_code) {
    document.getElementById('copyReferralBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(`https://futiaspace.com.ng/#/signup?ref=${profile.referral_code}`).then(() => showToast('Referral link copied!', 'success'));
    });
  }

  // Form submit
  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('fullName').value.trim();
    const level = document.getElementById('level').value;
    const bio = document.getElementById('bio').value.trim();
    const whatsapp = document.getElementById('whatsapp').value.trim();

    const { error } = await supabase.from('profiles').update({
      full_name: fullName,
      level,
      bio: bio || null,
      whatsapp_number: whatsapp || null
    }).eq('id', userId);

    if (error) showToast('Update failed: ' + error.message, 'error');
    else showToast('Profile updated!', 'success');
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }
}

async function loadDepartmentsDropdown(currentDepartment) {
  const select = document.getElementById('department');
  if (!select) return;
  const { data, error } = await supabase.from('departments').select('department').order('department');
  if (error) return;
  data.forEach(d => {
    const option = document.createElement('option');
    option.value = d.department;
    option.textContent = d.department;
    if (d.department === currentDepartment) option.selected = true;
    select.appendChild(option);
  });
}