// js/pages/settings.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { showToast } from '../ui/toast.js';
import { requestPushPermission } from '../lib/onesignal.js';

export async function renderSettings() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  const user = getCurrentUser();
  const userId = user.id;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, department, level, gender, bio, avatar_url, avatar_path, whatsapp_number, referral_code, onesignal_player_id')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    main.innerHTML = `<div style="padding:20px;">Profile not found.</div>`;
    return;
  }

  const pushEnabled = !!profile.onesignal_player_id;

  main.innerHTML = `
    <div class="settings-page">
      <h2>Edit Profile</h2>
      <form id="settingsForm">
        <div class="form-group">
          <label>Profile Photo</label>
          <div class="avatar-upload" id="avatarContainer">
            ${profile.avatar_url 
              ? `<img src="${escapeHtml(profile.avatar_url)}" id="profileAvatarPreview" class="avatar-img-large" />` 
              : `<div class="avatar-placeholder-large" id="profileAvatarPlaceholder">${getInitials(profile.full_name)}</div>`}
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
            <option value="">Loading...</option>
          </select>
          <small>Department cannot be changed after signup.</small>
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
          <small>Gender cannot be changed after signup.</small>
        </div>
        <div class="form-group">
          <label for="bio">Bio</label>
          <textarea id="bio" rows="3">${escapeHtml(profile.bio || '')}</textarea>
        </div>
        <div class="form-group">
          <label for="whatsapp">WhatsApp Number (optional)</label>
          <input type="tel" id="whatsapp" placeholder="+234 801 234 5678" value="${escapeHtml(profile.whatsapp_number || '')}" />
        </div>
        ${profile.referral_code ? `
          <div class="form-group">
            <label>Your Referral Link</label>
            <div style="display:flex; gap:8px;">
              <input type="text" readonly value="https://futiaspace.com.ng/#/signup?ref=${escapeHtml(profile.referral_code)}" id="referralLink" style="flex:1;" />
              <button type="button" class="btn btn-sm btn-secondary" id="copyReferralBtn"><i data-lucide="copy"></i></button>
            </div>
          </div>
        ` : ''}
        
        <!-- Push Notifications Section -->
        <div class="form-group">
          <label>Push Notifications</label>
          <div style="background:var(--bg-elevated); padding:14px; border-radius:var(--radius-md); margin-top:4px;">
            <p style="margin-bottom:10px; font-size:0.85rem;">
              ${pushEnabled 
                ? '✅ Notifications are enabled. You will receive updates about likes, comments, messages, and friend requests.' 
                : '🔕 Notifications are disabled. Enable them to stay updated.'}
            </p>
            ${!pushEnabled ? `
              <button type="button" class="btn btn-primary" id="enablePushBtn" style="margin-top:4px;">
                <i data-lucide="bell"></i> Enable Notifications
              </button>
            ` : ''}
          </div>
        </div>
        
        <button type="submit" class="btn btn-primary" id="saveBtn">Save Changes</button>
      </form>

      <input type="file" id="avatarFileInput" accept="image/*" style="display:none" />
      <div id="cropModal" class="compose-overlay" style="display:none;">
        <div class="crop-container" style="background:var(--bg-surface); padding:20px; border-radius:20px; width:90%; max-width:400px;">
          <h3>Crop your photo</h3>
          <div style="max-height:350px; overflow:hidden;">
            <img id="cropImage" style="max-width:100%;" />
          </div>
          <div style="margin-top:16px; display:flex; gap:12px;">
            <button type="button" class="btn btn-secondary" id="cancelCropBtn">Cancel</button>
            <button type="button" class="btn btn-primary" id="cropConfirmBtn">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  `;
  lucide.createIcons({ target: main });

  // Load departments
  await loadDepartmentsDropdown(profile.department);

  // Avatar change logic (unchanged)
  const fileInput = document.getElementById('avatarFileInput');
  const changeBtn = document.getElementById('changeAvatarBtn');
  const cropModal = document.getElementById('cropModal');
  const cropImage = document.getElementById('cropImage');
  const cancelCrop = document.getElementById('cancelCropBtn');
  const confirmCrop = document.getElementById('cropConfirmBtn');
  let cropper = null;
  let selectedFile = null;

  changeBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (event) => {
      cropImage.src = event.target.result;
      cropModal.style.display = 'flex';
      setTimeout(() => cropModal.classList.add('visible'), 10);
      if (cropper) cropper.destroy();
      cropImage.onload = () => {
        cropper = new Cropper(cropImage, {
          aspectRatio: 1,
          viewMode: 2,
          autoCropArea: 1,
          responsive: true,
          cropBoxMovable: true,
          cropBoxResizable: true,
          dragMode: 'move',
        });
      };
    };
    reader.readAsDataURL(file);
  });

  cancelCrop.addEventListener('click', () => {
    cropModal.classList.remove('visible');
    setTimeout(() => {
      cropModal.style.display = 'none';
      if (cropper) cropper.destroy();
      cropper = null;
    }, 200);
    fileInput.value = '';
  });

  confirmCrop.addEventListener('click', async () => {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({ width: 256, height: 256 });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    const path = `${userId}/avatar.jpg`;

    confirmCrop.disabled = true;
    confirmCrop.innerHTML = '<span class="spinner"></span> Uploading...';

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true });

    if (uploadError) {
      showToast('Upload failed: ' + uploadError.message, 'error');
      confirmCrop.disabled = false;
      confirmCrop.innerHTML = 'Confirm';
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl, avatar_path: path })
      .eq('id', userId);

    if (updateError) {
      showToast('Failed to update profile: ' + updateError.message, 'error');
    } else {
      showToast('Photo updated!', 'success');
      const avatarContainer = document.getElementById('avatarContainer');
      const existingImg = document.getElementById('profileAvatarPreview');
      const existingPlaceholder = document.getElementById('profileAvatarPlaceholder');
      if (existingImg) {
        existingImg.src = publicUrl;
      } else if (existingPlaceholder) {
        existingPlaceholder.outerHTML = `<img src="${publicUrl}" id="profileAvatarPreview" class="avatar-img-large" />`;
      } else {
        avatarContainer.insertAdjacentHTML('afterbegin', `<img src="${publicUrl}" id="profileAvatarPreview" class="avatar-img-large" />`);
      }
    }

    cropModal.classList.remove('visible');
    setTimeout(() => {
      cropModal.style.display = 'none';
      if (cropper) cropper.destroy();
      cropper = null;
    }, 200);
    fileInput.value = '';
    confirmCrop.disabled = false;
    confirmCrop.innerHTML = 'Confirm';
  });

  cropModal.addEventListener('click', (e) => {
    if (e.target === cropModal) cancelCrop.click();
  });

  // Push notifications button
  const enablePushBtn = document.getElementById('enablePushBtn');
  if (enablePushBtn) {
    enablePushBtn.addEventListener('click', async () => {
      const success = await requestPushPermission(userId);
      if (success) {
        showToast('Notifications enabled! You will now receive updates.', 'success');
        // Reload settings page to update the UI and show that push is enabled
        renderSettings();
      } else {
        showToast('Could not enable notifications. Please check browser permissions.', 'error');
      }
    });
  }

  // Copy referral link
  if (profile.referral_code) {
    document.getElementById('copyReferralBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(`https://futiaspace.com.ng/#/signup?ref=${profile.referral_code}`);
      showToast('Referral link copied!', 'success');
    });
  }

  // Save other changes
  const form = document.getElementById('settingsForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('fullName').value.trim();
    const level = document.getElementById('level').value;
    const bio = document.getElementById('bio').value.trim();
    const whatsapp = document.getElementById('whatsapp').value.trim();

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        level,
        bio: bio || null,
        whatsapp_number: whatsapp || null,
      })
      .eq('id', userId);

    if (updateError) {
      showToast('Update failed: ' + updateError.message, 'error');
    } else {
      showToast('Profile updated!', 'success');
    }
  });
}

async function loadDepartmentsDropdown(currentDepartment) {
  const select = document.getElementById('department');
  if (!select) return;
  const { data, error } = await supabase.from('departments').select('department').order('department');
  if (error) return;
  select.innerHTML = '';
  data.forEach(d => {
    const option = document.createElement('option');
    option.value = d.department;
    option.textContent = d.department;
    if (d.department === currentDepartment) option.selected = true;
    select.appendChild(option);
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}