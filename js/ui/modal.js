// js/ui/modal.js
export function showAlert(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-primary" id="modalOkBtn">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('modalOkBtn').addEventListener('click', () => {
      overlay.remove();
      resolve();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(); }
    });
  });
}

export function showConfirm(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="modalCancelBtn">Cancel</button>
          <button class="btn btn-danger" id="modalConfirmBtn">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = (val) => { overlay.remove(); resolve(val); };

    document.getElementById('modalCancelBtn').addEventListener('click', () => close(false));
    document.getElementById('modalConfirmBtn').addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}