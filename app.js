const STORAGE_KEY = 'wallet_passes';
const DB_NAME = 'wallet-storage';
const DB_VERSION = 1;
const DB_STORE = 'wallet';
const DB_RECORD_KEY = 'saved-cards';

const form = document.getElementById('add-pass-form');
const container = document.getElementById('wallet-container');
const statusMessage = document.getElementById('status-message');
const passTitleInput = document.getElementById('pass-title');
const passValueInput = document.getElementById('pass-value');
const refreshBtn = document.getElementById('btn-refresh');
const exportBtn = document.getElementById('btn-export');
const importBtn = document.getElementById('btn-import');
const backupFileInput = document.getElementById('backup-file');

let passes = [];
let expandedIndex = null;
let serviceWorkerRegistration = null;
let isRefreshing = false;
let isReloadingForUpdate = false;
let databasePromise;

function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
}

function isValidPasses(value) {
  return Array.isArray(value) && value.every((pass) =>
    pass && typeof pass.title === 'string' && typeof pass.value === 'string'
  );
}

function readLegacyPasses() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((pass) => pass && typeof pass.title === 'string' && typeof pass.value === 'string')
      : [];
  } catch (error) {
    console.warn('Could not read legacy wallet storage:', error);
    return [];
  }
}

function openDatabase() {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DB_STORE)) {
        database.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open saved-card storage.'));
    request.onblocked = () => reject(new Error('Saved-card storage upgrade is blocked by another open app tab.'));
  });
  return databasePromise;
}

async function readDatabasePasses() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, 'readonly');
    const request = transaction.objectStore(DB_STORE).get(DB_RECORD_KEY);
    request.onsuccess = () => {
      const record = request.result;
      if (!record) {
        resolve(null);
      } else if (isValidPasses(record.cards)) {
        resolve(record.cards);
      } else {
        reject(new Error('Saved-card data in IndexedDB is invalid.'));
      }
    };
    request.onerror = () => reject(request.error || new Error('Could not read saved cards.'));
  });
}

async function writeDatabasePasses(cards) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, 'readwrite');
    transaction.objectStore(DB_STORE).put({ id: DB_RECORD_KEY, cards });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save cards.'));
    transaction.onabort = () => reject(transaction.error || new Error('Saving cards was interrupted.'));
  });
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch (error) {
    console.info('Persistent storage request was not granted:', error);
  }
  return false;
}

async function initializeStorage() {
  try {
    const storedCards = await readDatabasePasses();
    if (storedCards !== null) {
      passes = storedCards;
    } else {
      // Migrate existing cards from the previous localStorage-based version.
      passes = readLegacyPasses();
      await writeDatabasePasses(passes);
    }

    // Keep a compatibility copy so data can still be recovered if IndexedDB
    // is unavailable in a later browser version.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(passes));
    } catch (error) {
      console.warn('Could not update the legacy storage copy:', error);
    }

    const persistent = await requestPersistentStorage();
    renderPasses();
    showStatus(
      persistent
        ? 'Cards are saved on this device.'
        : 'Cards are saved on this device. Export a backup to protect against browser data removal.',
      'info'
    );
  } catch (error) {
    console.error('Persistent storage initialization failed:', error);
    passes = readLegacyPasses();
    renderPasses();
    showStatus(
      'Device storage is unavailable. Cards may only be saved temporarily; export a backup.',
      'error'
    );
  }
}

async function persistPasses() {
  try {
    await writeDatabasePasses(passes);
  } catch (error) {
    console.error('Could not save cards to IndexedDB:', error);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(passes));
      showStatus('Saved with browser fallback storage. Export a backup to be safe.', 'error');
      return;
    } catch (fallbackError) {
      console.error('Could not save cards to localStorage either:', fallbackError);
      throw new Error('Could not save cards on this device. Export or copy your card details before leaving.');
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(passes));
  } catch (error) {
    console.warn('Could not update legacy storage copy:', error);
  }
}

function toggleCard(index) {
  expandedIndex = expandedIndex === index ? null : index;
  renderPasses();
}

function toggleCode(index) {
  const barcode = document.getElementById(`barcode-${index}`);
  const qr = document.getElementById(`qr-${index}`);
  if (!barcode || !qr) return;

  const showBarcode = barcode.classList.contains('hidden');
  barcode.classList.toggle('hidden', !showBarcode);
  qr.classList.toggle('hidden', showBarcode);
}

async function removePass(index) {
  const title = passes[index]?.title || 'this card';
  if (!window.confirm(`Remove “${title}” from your wallet?`)) return;

  const updatedPasses = passes.filter((_, passIndex) => passIndex !== index);
  const previousPasses = passes;
  passes = updatedPasses;
  expandedIndex = null;
  try {
    await persistPasses();
    renderPasses();
    showStatus('Card removed.', 'success');
  } catch (error) {
    passes = previousPasses;
    showStatus(error.message, 'error');
  }
}

function createCollapsedCard(pass, index) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'pass-card collapsed';
  card.setAttribute('aria-expanded', 'false');
  card.addEventListener('click', () => toggleCard(index));

  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = pass.title;

  const number = document.createElement('span');
  number.className = 'card-preview';
  number.textContent = pass.value;

  const arrow = document.createElement('span');
  arrow.className = 'card-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '›';

  const text = document.createElement('span');
  text.className = 'card-text';
  text.append(title, number);
  card.append(text, arrow);
  return card;
}

function createExpandedCard(pass, index) {
  const card = document.createElement('article');
  card.className = 'pass-card expanded';

  const header = document.createElement('div');
  header.className = 'expanded-header';

  const title = document.createElement('h3');
  title.textContent = pass.title;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'icon-button';
  closeButton.setAttribute('aria-label', 'Close card details');
  closeButton.textContent = '×';
  closeButton.addEventListener('click', () => toggleCard(index));
  header.append(title, closeButton);

  const codeToggle = document.createElement('button');
  codeToggle.type = 'button';
  codeToggle.className = 'code-toggle';
  codeToggle.setAttribute('aria-label', 'Switch between barcode and QR code');

  const barcodeContainer = document.createElement('div');
  barcodeContainer.id = `barcode-${index}`;
  barcodeContainer.className = 'code-panel';
  const barcode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  barcode.setAttribute('class', 'barcode');
  barcodeContainer.appendChild(barcode);

  const qrContainer = document.createElement('div');
  qrContainer.id = `qr-${index}`;
  qrContainer.className = 'code-panel hidden';

  codeToggle.append(barcodeContainer, qrContainer);
  codeToggle.addEventListener('click', () => toggleCode(index));

  const codeHint = document.createElement('p');
  codeHint.className = 'code-hint';
  codeHint.textContent = 'Tap the code to switch between barcode and QR';

  const passCode = document.createElement('p');
  passCode.className = 'pass-code';
  passCode.textContent = pass.value;

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'btn-delete';
  deleteButton.textContent = 'Remove card';
  deleteButton.addEventListener('click', () => removePass(index));

  card.append(header, codeToggle, codeHint, passCode, deleteButton);

  try {
    JsBarcode(barcode, pass.value, {
      format: 'CODE128',
      width: 2,
      height: 64,
      displayValue: false,
      background: '#ffffff',
      lineColor: '#111827',
      margin: 8,
    });
  } catch (error) {
    barcodeContainer.textContent = 'This value cannot be displayed as a barcode.';
    barcodeContainer.classList.add('code-error');
  }

  try {
    new QRCode(qrContainer, {
      text: pass.value,
      width: 160,
      height: 160,
      colorDark: '#111827',
      colorLight: '#ffffff',
    });
  } catch (error) {
    qrContainer.textContent = 'Could not create a QR code.';
    qrContainer.classList.add('code-error');
  }

  return card;
}

function renderPasses() {
  container.replaceChildren();

  if (passes.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'Your saved cards will appear here.';
    container.appendChild(emptyState);
    return;
  }

  passes.forEach((pass, index) => {
    const card = expandedIndex === index
      ? createExpandedCard(pass, index)
      : createCollapsedCard(pass, index);
    container.appendChild(card);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const title = passTitleInput.value.trim();
  const value = passValueInput.value.trim();
  if (!title || !value) {
    showStatus('Enter both a card name and number.', 'error');
    (!title ? passTitleInput : passValueInput).focus();
    return;
  }
  if (title.length > 80 || value.length > 500) {
    showStatus('Card name or number is too long.', 'error');
    return;
  }
  const duplicate = passes.some((pass) =>
    pass.title.toLowerCase() === title.toLowerCase() &&
    pass.value.toLowerCase() === value.toLowerCase()
  );
  if (duplicate) {
    showStatus('That card is already saved.', 'error');
    return;
  }

  const previousPasses = passes;
  passes = [...passes, { title, value }];
  try {
    await persistPasses();
    expandedIndex = passes.length - 1;
    form.reset();
    renderPasses();
    showStatus('Card added and saved on this device.', 'success');
    passTitleInput.focus();
  } catch (error) {
    passes = previousPasses;
    showStatus(error.message, 'error');
  }
});

function exportBackup() {
  const backup = {
    format: 'cards-wallet-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: passes,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `my-wallet-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showStatus('Backup file exported. Store it somewhere safe.', 'success');
}

async function importBackup(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const importedCards = Array.isArray(parsed) ? parsed : parsed?.cards;
    if (!isValidPasses(importedCards)) {
      throw new Error('That file does not contain a valid wallet backup.');
    }

    const normalized = importedCards.map((pass) => ({
      title: pass.title.trim(),
      value: pass.value.trim(),
    })).filter((pass) => pass.title && pass.value);
    if (normalized.length !== importedCards.length) {
      throw new Error('The backup contains a card with an empty name or number. No cards were imported.');
    }

    if (!window.confirm(`Import ${normalized.length} cards? This replaces the cards currently on this device.`)) {
      return;
    }

    const previousPasses = passes;
    passes = normalized;
    try {
      await persistPasses();
    } catch (error) {
      passes = previousPasses;
      throw error;
    }
    expandedIndex = null;
    renderPasses();
    showStatus(`${passes.length} cards restored from backup.`, 'success');
  } catch (error) {
    console.error('Could not import wallet backup:', error);
    showStatus(error.message || 'Could not read that backup file.', 'error');
  } finally {
    backupFileInput.value = '';
  }
}

exportBtn.addEventListener('click', exportBackup);
importBtn.addEventListener('click', () => backupFileInput.click());
backupFileInput.addEventListener('change', () => {
  const file = backupFileInput.files?.[0];
  if (file) importBackup(file);
});

function activateWaitingWorker(registration) {
  if (!registration.waiting) return false;
  isReloadingForUpdate = true;
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  showStatus('Update ready. Reloading…', 'info');
  return true;
}

async function refreshApp() {
  if (isRefreshing) return;
  if (!serviceWorkerRegistration) {
    showStatus('Update check is not available right now.', 'error');
    return;
  }

  isRefreshing = true;
  refreshBtn.disabled = true;
  showStatus('Checking for updates…', 'info');
  try {
    await serviceWorkerRegistration.update();
    if (activateWaitingWorker(serviceWorkerRegistration)) return;

    const installingWorker = serviceWorkerRegistration.installing;
    if (installingWorker) {
      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed' && activateWaitingWorker(serviceWorkerRegistration)) return;
        if (installingWorker.state === 'redundant' && isRefreshing) {
          showStatus('You have the latest version.', 'success');
          refreshBtn.disabled = false;
          isRefreshing = false;
        }
      });
      showStatus('Update is installing…', 'info');
      return;
    }

    showStatus('You have the latest version.', 'success');
    refreshBtn.disabled = false;
    isRefreshing = false;
  } catch (error) {
    console.error('Failed to check for updates:', error);
    showStatus('Could not check for updates. Try again when online.', 'error');
    refreshBtn.disabled = false;
    isRefreshing = false;
  }
}

refreshBtn.addEventListener('click', refreshApp);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isReloadingForUpdate) window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        serviceWorkerRegistration = registration;
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showStatus('A new version is available. Tap ↻ to update.', 'info');
            }
          });
        });
      })
      .catch((error) => console.error('Service worker registration failed:', error));
  });
}

initializeStorage();
