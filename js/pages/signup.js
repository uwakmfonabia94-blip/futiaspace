// js/pages/signup.js
import { navigate } from '../router.js';
import { supabase } from '../supabase.js';

let currentStep = 1;
const totalSteps = 4;               // now 4 steps

export function renderSignup() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="auth-container" id="signupContainer">
      <div class="auth-logo">
        <img src="logo.svg" alt="FutiaSpace" />
      </div>
      <h1 class="auth-title">Join FutiaSpace</h1>
      <p class="auth-subtitle" id="stepDescription">
        Step 1 of ${totalSteps}: Your account details
      </p>
      <div class="step-indicator" id="stepIndicator">
        <span class="step-dot active" data-step="1"></span>
        <span class="step-dot" data-step="2"></span>
        <span class="step-dot" data-step="3"></span>
        <span class="step-dot" data-step="4"></span>
      </div>

      <form id="signupForm" style="flex:1;">
        <!-- Step 1: Email, Password, Full Name -->
        <div id="step1" class="step-content">
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" required placeholder="Your Email" />
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" required minlength="6" placeholder="At least 6 characters" />
            <button type="button" class="password-toggle" id="togglePassword">
              <i data-lucide="eye"></i>
            </button>
          </div>
          <div class="form-group">
            <label for="fullName">Full Name</label>
            <input type="text" id="fullName" required placeholder="E.g Uwakmfon Theophilus" />
          </div>
        </div>

        <!-- Step 2: Department, Level, Gender -->
        <div id="step2" class="step-content" style="display:none;">
          <div class="form-group">
            <label for="department">Department</label>
            <select id="department" required>
              <option value="">Select department…</option>
            </select>
          </div>
          <div class="form-group">
            <label for="level">Level</label>
            <select id="level" required>
              <option value="">Select level</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="300">300</option>
            </select>
          </div>
          <div class="form-group">
            <label for="gender">Gender</label>
            <select id="gender" required>
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        </div>

        <!-- Step 3: Bio (optional) -->
        <div id="step3" class="step-content" style="display:none;">
          <div class="form-group">
            <label for="bio">Bio (optional)</label>
            <textarea id="bio" rows="3" placeholder="Tell us about yourself…"></textarea>
          </div>
        </div>

        <!-- Step 4: Profile Photo (compulsory) -->
        <div id="step4" class="step-content" style="display:none;">
          <p style="color:var(--color-text-secondary); font-size:14px; margin-bottom:12px;">
            Add a profile photo – it helps people recognise you on campus.
          </p>
          <div class="avatar-upload" id="avatarContainer">
            <div class="avatar-placeholder-large" id="avatarPreviewPlaceholder">?</div>
            <img id="avatarPreview" class="avatar-img-large" style="display:none;" />
            <input type="file" id="avatarFileInput" accept="image/*" style="display:none;" />
            <button type="button" class="btn btn-secondary" id="choosePhotoBtn">Choose Photo</button>
            <small style="color:var(--color-text-muted); display:block; margin-top:8px;">
              This photo is required. It will be compressed automatically.
            </small>
          </div>
        </div>

        <div class="step-buttons">
          <button type="button" class="btn btn-secondary" id="backBtn" style="display:none;">Back</button>
          <button type="button" class="btn btn-primary" id="nextBtn">Next</button>
          <button type="submit" class="btn btn-primary" id="submitBtn" style="display:none;" disabled>Create Account</button>
        </div>
      </form>

      <p class="auth-link">Already have an account? <a href="#/login">Log in</a></p>
      <div id="signupError" style="color: var(--color-danger); text-align:center; margin-top:8px;"></div>
      <div class="auth-footer">&copy; 2026 Uwakmfon Theophilus Production</div>
    </div>
  `;
  lucide.createIcons();

  // Load departments
  loadDepartments();

  // ── Password toggle (step 1) ─────────────────────
  const toggleBtn = document.getElementById('togglePassword');
  const pwField = document.getElementById('password');
  let showPw = false;
  toggleBtn.addEventListener('click', () => {
    showPw = !showPw;
    pwField.type = showPw ? 'text' : 'password';
    toggleBtn.innerHTML = `<i data-lucide="${showPw ? 'eye-off' : 'eye'}"></i>`;
    lucide.createIcons({ target: toggleBtn });
  });

  // ── Photo handling (step 4) ──────────────────────
  const fileInput = document.getElementById('avatarFileInput');
  const chooseBtn = document.getElementById('choosePhotoBtn');
  const placeholder = document.getElementById('avatarPreviewPlaceholder');
  const previewImg = document.getElementById('avatarPreview');
  let selectedFile = null;

  chooseBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      previewImg.src = ev.target.result;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
    updateSubmitBtnState();
  });

  // ── Multi‑step navigation ────────────────────────
  const nextBtn = document.getElementById('nextBtn');
  const backBtn = document.getElementById('backBtn');
  const submitBtn = document.getElementById('submitBtn');
  const stepDesc = document.getElementById('stepDescription');

  function showStep(step) {
    for (let i = 1; i <= totalSteps; i++) {
      document.getElementById(`step${i}`).style.display = (i === step) ? 'block' : 'none';
    }
    document.querySelectorAll('.step-dot').forEach(dot => {
      dot.classList.toggle('active', parseInt(dot.dataset.step) === step);
    });
    const labels = [
      'Your account details',
      'Campus info',
      'About you',
      'Profile photo'
    ];
    stepDesc.textContent = `Step ${step} of ${totalSteps}: ${labels[step - 1]}`;
    backBtn.style.display = step === 1 ? 'none' : 'inline-block';
    nextBtn.style.display = step === totalSteps ? 'none' : 'inline-block';
    submitBtn.style.display = step === totalSteps ? 'inline-block' : 'none';
    currentStep = step;
    updateSubmitBtnState();
  }

  function updateSubmitBtnState() {
    const isStep4 = currentStep === totalSteps;
    const photoReady = !!selectedFile;
    if (isStep4) {
      submitBtn.disabled = !photoReady;
    }
  }

  function validateStep(step) {
    if (step === 1) {
      const email = document.getElementById('email').value.trim();
      const pwd = document.getElementById('password').value;
      const fullName = document.getElementById('fullName').value.trim();
      return email && pwd && pwd.length >= 6 && fullName;
    } else if (step === 2) {
      const dept = document.getElementById('department').value;
      const level = document.getElementById('level').value;
      const gender = document.getElementById('gender').value;
      return dept && level && gender;
    } else if (step === 3) {
      return true; // bio optional
    } else if (step === 4) {
      return !!selectedFile;   // photo is compulsory
    }
    return true;
  }

  nextBtn.addEventListener('click', () => {
    if (validateStep(currentStep) && currentStep < totalSteps) showStep(currentStep + 1);
    else if (!validateStep(currentStep)) alert('Please fill in all required fields correctly.');
  });

  backBtn.addEventListener('click', () => {
    if (currentStep > 1) showStep(currentStep - 1);
  });

  // ── Form submission ──────────────────────────────
  const form = document.getElementById('signupForm');
  const errorEl = document.getElementById('signupError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateStep(currentStep)) return;
    errorEl.textContent = '';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const fullName = document.getElementById('fullName').value.trim();
    const department = document.getElementById('department').value;
    const level = document.getElementById('level').value;
    const gender = document.getElementById('gender').value;
    const bio = document.getElementById('bio').value.trim();

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>';

    // 1. Create the user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          department,
          level,
          gender,
          bio: bio || null
        }
      }
    });

    if (error) {
      errorEl.textContent = error.message;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
      return;
    }

    // 2. If photo selected, upload after signup (user is now logged in)
    if (selectedFile) {
      try {
        const userId = data.user.id;
        // Compress image
        const compressedBlob = await compressImage(selectedFile, 0.6, 512);
        const path = `${userId}/avatar.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, compressedBlob, { upsert: true });
        if (uploadError) {
          console.error('Photo upload failed:', uploadError);
          alert('Account created, but photo upload failed. You can add one later in Settings.');
        } else {
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
          await supabase.from('profiles').update({
            avatar_url: publicUrl,
            avatar_path: path
          }).eq('id', userId);
        }
      } catch (err) {
        console.error('Image processing error:', err);
      }
    }

    // onAuthStateChange will redirect to directory
  });

  // Start at step 1
  showStep(1);
}

// ── Image compression utility ──────────────────────
async function compressImage(file, quality = 0.6, maxWidth = 512) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      };
    };
    reader.readAsDataURL(file);
  });
}

// ── Load departments ───────────────────────────────
async function loadDepartments() {
  const select = document.getElementById('department');
  if (!select) return;
  const { data, error } = await supabase.from('departments').select('department').order('department');
  if (error) return;
  data.forEach(d => {
    const option = document.createElement('option');
    option.value = d.department;
    option.textContent = d.department;
    select.appendChild(option);
  });
}