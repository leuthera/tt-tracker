// ─── Locations Tab ──────────────────────────────────────────────────────────

import { t } from './i18n.js';
import { esc, relativeTime } from './helpers.js';
import {
  state, loadLocations, getLocationById,
  addLocation, updateLocation, deleteLocation,
  uploadLocationImage, deleteLocationImage
} from './state.js';
import { showModal, hideModal, showConfirmModal, showToast } from './ui.js';

// ─── IMAGE RESIZE HELPER ──────────────────────────────────────────────────

function resizeImage(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── RENDER LOCATIONS LIST ─────────────────────────────────────────────────

function renderLocations() {
  const el = document.getElementById('locations-list');
  const locations = loadLocations();
  const addBtn = document.getElementById('add-location-btn');
  addBtn.textContent = t('locations.addLocation');

  if (locations.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">&#x1F4CD;</div>
        <div class="empty-state__title">${esc(t('locations.noLocationsTitle'))}</div>
        <div class="empty-state__text">${esc(t('locations.noLocationsText'))}</div>
      </div>
    `;
    return;
  }

  el.innerHTML = '';
  locations.forEach(loc => {
    const card = document.createElement('div');
    card.className = 'location-card';

    const imgEl = document.createElement('div');
    imgEl.className = 'location-card__image';
    if (loc.image) {
      const img = document.createElement('img');
      img.src = `/api/locations/${loc.id}/image?t=${Date.now()}`;
      img.alt = loc.name;
      imgEl.appendChild(img);
    } else {
      imgEl.innerHTML = '<span class="location-card__placeholder">&#x1F4CD;</span>';
    }
    card.appendChild(imgEl);

    const info = document.createElement('div');
    info.className = 'location-card__info';
    info.innerHTML = `
      <div class="location-card__name">${esc(loc.name)}</div>
      <div class="location-card__coords">${loc.lat != null && loc.lng != null
        ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`
        : esc(t('locationDetail.noCoords'))}</div>
    `;
    card.appendChild(info);

    const chevron = document.createElement('span');
    chevron.className = 'player-row__chevron';
    chevron.textContent = '\u203A';
    card.appendChild(chevron);

    card.addEventListener('click', () => showLocationDetailModal(loc.id));
    el.appendChild(card);
  });
}

// ─── ADD LOCATION MODAL ────────────────────────────────────────────────────

function showAddLocationModal() {
  showModal({
    title: t('addLocation.title'),
    bodyHTML: `
      <div class="form-group">
        <label class="form-label" for="loc-name">${esc(t('addLocation.nameLabel'))}</label>
        <input type="text" class="form-input" id="loc-name"
               placeholder="${esc(t('addLocation.namePlaceholder'))}" maxlength="60" autocomplete="off">
      </div>
      <div class="form-group">
        <button type="button" class="btn btn--secondary" id="loc-gps-btn">${esc(t('addLocation.gpsButton'))}</button>
      </div>
      <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <label class="form-label" for="loc-lat">${esc(t('addLocation.latLabel'))}</label>
          <input type="number" step="any" class="form-input" id="loc-lat" placeholder="0.0000">
        </div>
        <div>
          <label class="form-label" for="loc-lng">${esc(t('addLocation.lngLabel'))}</label>
          <input type="number" step="any" class="form-input" id="loc-lng" placeholder="0.0000">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${esc(t('addLocation.imageLabel'))}</label>
        <input type="file" accept="image/*" id="loc-image-input" style="font-size:14px">
        <div id="loc-image-preview" class="image-upload-preview"></div>
      </div>
    `,
    footerHTML: `<button class="btn btn--primary" id="modal-save-location">${esc(t('addLocation.save'))}</button>`
  });

  const nameInput = document.getElementById('loc-name');
  setTimeout(() => nameInput.focus(), 50);

  let selectedFile = null;

  document.getElementById('loc-gps-btn').addEventListener('click', () => {
    const btn = document.getElementById('loc-gps-btn');
    btn.textContent = t('addLocation.gpsDetecting');
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        document.getElementById('loc-lat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('loc-lng').value = pos.coords.longitude.toFixed(6);
        btn.textContent = t('addLocation.gpsButton');
        btn.disabled = false;
      },
      () => {
        showToast(t('addLocation.gpsError'), 'error');
        btn.textContent = t('addLocation.gpsButton');
        btn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  document.getElementById('loc-image-input').addEventListener('change', e => {
    selectedFile = e.target.files[0] || null;
    const preview = document.getElementById('loc-image-preview');
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      preview.innerHTML = `<img src="${url}" alt="Preview">`;
    } else {
      preview.innerHTML = '';
    }
  });

  const save = async () => {
    const btn = document.getElementById('modal-save-location');
    btn.disabled = true;
    const name = nameInput.value.trim();
    const latVal = document.getElementById('loc-lat').value;
    const lngVal = document.getElementById('loc-lng').value;
    const lat = latVal ? parseFloat(latVal) : null;
    const lng = lngVal ? parseFloat(lngVal) : null;

    const res = await addLocation({ name, lat, lng });
    if (!res.ok) { showToast(res.error, 'error'); btn.disabled = false; return; }

    if (selectedFile) {
      try {
        const base64 = await resizeImage(selectedFile, 800, 0.7);
        await uploadLocationImage(res.location.id, base64);
      } catch (e) {
        showToast('Image upload failed', 'error');
      }
    }

    hideModal();
    showToast(t('toast.locationAdded'), 'success');
    renderLocations();
  };

  document.getElementById('modal-save-location').addEventListener('click', save);
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
}

// ─── LOCATION DETAIL MODAL ─────────────────────────────────────────────────

function showLocationDetailModal(locationId) {
  const loc = getLocationById(locationId);
  if (!loc) return;

  const imgHTML = loc.image
    ? `<div class="location-detail__image"><img src="/api/locations/${loc.id}/image?t=${Date.now()}" alt="${esc(loc.name)}"></div>`
    : `<div class="location-detail__image location-detail__image--empty"><span>&#x1F4CD;</span><p>${esc(t('locationDetail.noImage'))}</p></div>`;

  const coordsHTML = loc.lat != null && loc.lng != null
    ? `<div class="text-muted text-sm">${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}</div>`
    : `<div class="text-muted text-sm">${esc(t('locationDetail.noCoords'))}</div>`;

  let footerBtns = '';
  if (state.me.role === 'admin') {
    footerBtns += `<button class="btn btn--secondary" id="modal-edit-location">${esc(t('locationDetail.edit'))}</button>`;
    if (loc.image) {
      footerBtns += `<button class="btn btn--secondary" id="modal-remove-image">${esc(t('locationDetail.removeImage'))}</button>`;
    } else {
      footerBtns += `<label class="btn btn--secondary" style="cursor:pointer"><input type="file" accept="image/*" id="modal-upload-image-input" style="display:none">${esc(t('locationDetail.uploadImage'))}</label>`;
    }
    footerBtns += `<button class="btn btn--danger" id="modal-delete-location">${esc(t('locationDetail.delete'))}</button>`;
  }

  showModal({
    title: loc.name,
    bodyHTML: `
      ${imgHTML}
      ${coordsHTML}
      <div class="text-muted text-sm mt-sm">${relativeTime(loc.createdAt)}</div>
    `,
    footerHTML: footerBtns
  });

  if (state.me.role !== 'admin') return;

  document.getElementById('modal-edit-location')?.addEventListener('click', () => {
    hideModal();
    showEditLocationModal(locationId);
  });

  document.getElementById('modal-delete-location')?.addEventListener('click', () => {
    hideModal();
    const msg = t('confirm.deleteLocation', { name: loc.name });
    showConfirmModal(msg, async () => {
      const res = await deleteLocation(locationId, true);
      if (!res.ok) { showToast(res.error, 'error'); return; }
      showToast(t('toast.locationDeleted'), 'success');
      renderLocations();
    });
  });

  document.getElementById('modal-remove-image')?.addEventListener('click', async () => {
    try {
      await deleteLocationImage(locationId);
      showToast(t('toast.imageRemoved'), 'success');
      hideModal();
      renderLocations();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  document.getElementById('modal-upload-image-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const base64 = await resizeImage(file, 800, 0.7);
      await uploadLocationImage(locationId, base64);
      showToast(t('toast.imageUploaded'), 'success');
      hideModal();
      renderLocations();
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
    }
  });
}

// ─── EDIT LOCATION MODAL ───────────────────────────────────────────────────

function showEditLocationModal(locationId) {
  const loc = getLocationById(locationId);
  if (!loc) return;

  showModal({
    title: t('locationDetail.editTitle'),
    bodyHTML: `
      <div class="form-group">
        <label class="form-label" for="edit-loc-name">${esc(t('addLocation.nameLabel'))}</label>
        <input type="text" class="form-input" id="edit-loc-name" value="${esc(loc.name)}" maxlength="60">
      </div>
      <div class="form-group">
        <button type="button" class="btn btn--secondary" id="edit-loc-gps-btn">${esc(t('addLocation.gpsButton'))}</button>
      </div>
      <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <label class="form-label" for="edit-loc-lat">${esc(t('addLocation.latLabel'))}</label>
          <input type="number" step="any" class="form-input" id="edit-loc-lat" value="${loc.lat ?? ''}">
        </div>
        <div>
          <label class="form-label" for="edit-loc-lng">${esc(t('addLocation.lngLabel'))}</label>
          <input type="number" step="any" class="form-input" id="edit-loc-lng" value="${loc.lng ?? ''}">
        </div>
      </div>
    `,
    footerHTML: `<button class="btn btn--primary" id="modal-save-edit-location">${esc(t('locationDetail.save'))}</button>`
  });

  document.getElementById('edit-loc-gps-btn').addEventListener('click', () => {
    const btn = document.getElementById('edit-loc-gps-btn');
    btn.textContent = t('addLocation.gpsDetecting');
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        document.getElementById('edit-loc-lat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('edit-loc-lng').value = pos.coords.longitude.toFixed(6);
        btn.textContent = t('addLocation.gpsButton');
        btn.disabled = false;
      },
      () => {
        showToast(t('addLocation.gpsError'), 'error');
        btn.textContent = t('addLocation.gpsButton');
        btn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  document.getElementById('modal-save-edit-location').addEventListener('click', async () => {
    const btn = document.getElementById('modal-save-edit-location');
    btn.disabled = true;
    const name = document.getElementById('edit-loc-name').value.trim();
    const latVal = document.getElementById('edit-loc-lat').value;
    const lngVal = document.getElementById('edit-loc-lng').value;
    const lat = latVal ? parseFloat(latVal) : null;
    const lng = lngVal ? parseFloat(lngVal) : null;

    const res = await updateLocation(locationId, { name, lat, lng });
    if (!res.ok) { showToast(res.error, 'error'); btn.disabled = false; return; }
    hideModal();
    showToast(t('toast.locationUpdated'), 'success');
    renderLocations();
  });
}

export { renderLocations, showAddLocationModal };
