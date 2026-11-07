const STORAGE_KEY = 'wallet_passes';
const form = document.getElementById('add-pass-form');
const container = document.getElementById('wallet-container');
const statusMessage = document.getElementById('status-message');
const passTitleInput = document.getElementById('pass-title');
const passValueInput = document.getElementById('pass-value');
const scanBtn = document.getElementById('btn-scan');
const refreshBtn = document.getElementById('btn-refresh');
const readerContainer = document.getElementById('reader-container');

let passes = loadPasses();
let expandedIndex = null;
let html5QrCode;
let isScanning = false;
let serviceWorkerRegistration = null;
let isRefreshing = false;
let isReloadingForUpdate = false;

function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
}

function loadPasses() {
  try {
    const storedPasses = localStorage.getItem(STORAGE_KEY);
    if (!storedPasses) {
      return [];
    }

    const parsed = JSON.parse(storedPasses);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((pass) => pass && typeof pass.title === 'string' && typeof pass.value === 'string');
  } catch (error) {
    console.error('Failed to load wallet passes:', error);
    return [];
  }
}

function persistPasses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(passes));
}

function toggleCard(index) {
  expandedIndex = expandedIndex === index ? null : index;
  renderPasses();
}

function toggleCode(index) {
  const barcodeEl = document.getElementById(`barcode-${index}`);
  const qrEl = document.getElementById(`qr-${index}`);

  if (!barcodeEl || !qrEl) {
    return;
  }

  const showBarcode = barcodeEl.classList.contains('hidden');
  barcodeEl.classList.toggle('hidden', !showBarcode);
  qrEl.classList.toggle('hidden', showBarcode);
}

function removePass(index) {
  const challenge = Math.random().toString(36).substring(2, 6).toUpperCase();
  const userInput = window.prompt(`To delete this pass, type this exact code: ${challenge}`);

  if (userInput === null) {
    return;
  }

  if (userInput.trim().toUpperCase() !== challenge) {
    showStatus('Incorrect code. Deletion cancelled.', 'error');
    return;
  }

  passes.splice(index, 1);
  expandedIndex = null;
  persistPasses();
  renderPasses();
  showStatus('Pass deleted.', 'success');
}

function createCollapsedCard(pass, index) {
  const card = document.createElement('div');
  card.className = 'pass-card collapsed';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');

  const icon = document.createElement('div');
  icon.className = 'card-icon';
  icon.textContent = '💳';

  const title = document.createElement('h3');
  title.textContent = pass.title;

  card.append(icon, title);

  const activate = () => toggleCard(index);
  card.addEventListener('click', activate);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  });

  return card;
}

function createExpandedCard(pass, index) {
  const card = document.createElement('article');
  card.className = 'pass-card expanded';

  const title = document.createElement('h3');
  title.textContent = pass.title;

  const codeToggle = document.createElement('div');
  codeToggle.className = 'code-toggle';
  codeToggle.setAttribute('role', 'button');
  codeToggle.setAttribute('tabindex', '0');
  codeToggle.setAttribute('aria-label', 'Toggle code display');

  const barcodeContainer = document.createElement('div');
  barcodeContainer.id = `barcode-${index}`;
  barcodeContainer.className = 'barcode-container';

  const barcode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  barcode.setAttribute('class', 'barcode');
  barcode.setAttribute('data-value', pass.value);
  barcodeContainer.appendChild(barcode);

  const qrContainer = document.createElement('div');
  qrContainer.id = `qr-${index}`;
  qrContainer.className = 'qr-container hidden';

  const tapHint = document.createElement('p');
  tapHint.className = 'tap-hint';
  tapHint.textContent = 'Tap code to switch (Barcode / QR)';

  codeToggle.append(barcodeContainer, qrContainer, tapHint);

  const passCode = document.createElement('div');
  passCode.className = 'pass-code';
  passCode.textContent = pass.value;

  const buttonGroup = document.createElement('div');
  buttonGroup.className = 'button-group';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn-close';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => toggleCard(index));

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'btn-delete';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => removePass(index));

  buttonGroup.append(closeButton, deleteButton);
  card.append(title, codeToggle, passCode, buttonGroup);

  codeToggle.addEventListener('click', () => toggleCode(index));
  codeToggle.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleCode(index);
    }
  });

  try {
    JsBarcode(barcode, pass.value, {
      format: 'CODE128',
      width: 2,
      height: 60,
      displayValue: false,
      background: '#ffffff',
      lineColor: '#000000',
      margin: 5,
    });
  } catch (error) {
    barcodeContainer.innerHTML = '<p class="error">Invalid barcode data</p>';
  }

  try {
    new QRCode(qrContainer, {
      text: pass.value,
      width: 120,
      height: 120,
      colorDark: '#000000',
      colorLight: '#ffffff',
    });
  } catch (error) {
    qrContainer.innerHTML = '<p class="error">Invalid QR data</p>';
  }

  return card;
}

function renderPasses() {
  container.innerHTML = '';

  if (passes.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No cards saved yet. Add one to get started.';
    container.appendChild(emptyState);
    return;
  }

  passes.forEach((pass, index) => {
    const card = expandedIndex === index ? createExpandedCard(pass, index) : createCollapsedCard(pass, index);
    container.appendChild(card);
  });
}

function validateForm() {
  const title = passTitleInput.value.trim();
  const value = passValueInput.value.trim();

  if (!title || !value) {
    showStatus('Please add both a pass name and a value.', 'error');
    return null;
  }

  if (title.length > 80 || value.length > 500) {
    showStatus('Your pass title or value is too long.', 'error');
    return null;
  }

  return { title, value };
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const payload = validateForm();
  if (!payload) {
    return;
  }

  const duplicate = passes.some(
    (pass) => pass.title.toLowerCase() === payload.title.toLowerCase() && pass.value.toLowerCase() === payload.value.toLowerCase()
  );

  if (duplicate) {
    showStatus('This pass already exists in your wallet.', 'error');
    return;
  }

  passes.push({ title: payload.title, value: payload.value });
  persistPasses();
  form.reset();
  renderPasses();
  showStatus('Pass added to wallet.', 'success');
  passTitleInput.focus();
});

function activateWaitingWorker(registration) {
  if (!registration.waiting) {
    return false;
  }

  isReloadingForUpdate = true;
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  showStatus('Update downloaded. Reloading the wallet…', 'success');
  return true;
}

async function refreshApp() {
  if (isRefreshing) {
    return;
  }

  if (!('serviceWorker' in navigator) || !serviceWorkerRegistration) {
    showStatus('App refresh is unavailable. Reload the page when you are online.', 'error');
    return;
  }

  isRefreshing = true;
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Checking…';
  showStatus('Checking for the latest version…', 'info');

  try {
    await serviceWorkerRegistration.update();

    if (activateWaitingWorker(serviceWorkerRegistration)) {
      return;
    }

    const installingWorker = serviceWorkerRegistration.installing;
    if (installingWorker) {
      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed' && activateWaitingWorker(serviceWorkerRegistration)) {
          return;
        }

        if (installingWorker.state === 'redundant' && isRefreshing) {
          showStatus('The wallet is up to date.', 'success');
          refreshBtn.disabled = false;
          refreshBtn.textContent = '↻ Refresh app';
          isRefreshing = false;
        }
      });
      showStatus('An update is installing…', 'info');
      return;
    }

    showStatus('Wallet is up to date. Reloading with the latest files…', 'success');
    window.location.reload();
  } catch (error) {
    console.error('Failed to check for app updates:', error);
    showStatus('Could not check for updates. Check your connection and try again.', 'error');
    refreshBtn.disabled = false;
    refreshBtn.textContent = '↻ Refresh app';
    isRefreshing = false;
  }
}

refreshBtn.addEventListener('click', refreshApp);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isReloadingForUpdate) {
      window.location.reload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        serviceWorkerRegistration = registration;
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) {
            return;
          }

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showStatus('A new version is available. Tap Refresh app to install it.', 'info');
            }
          });
        });
      })
      .catch((error) => {
        console.error('Service worker registration failed:', error);
      });
  });
}

function handleScannerStart() {
  if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.getUserMedia) {
    showStatus('This browser does not support camera scanning.', 'error');
    return;
  }

  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode('reader', {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
      ],
    });
  }

  if (isScanning) {
    html5QrCode.stop()
      .then(() => {
        isScanning = false;
        readerContainer.classList.add('hidden');
        scanBtn.textContent = '📷 Scan Card';
        showStatus('Scanner cancelled.', 'info');
      })
      .catch((error) => {
        console.error('Failed to stop camera:', error);
        showStatus('Unable to stop the camera cleanly.', 'error');
      });
    return;
  }

  readerContainer.classList.remove('hidden');
  html5QrCode.start(
    { facingMode: 'environment' },
    {
      fps: 10,
      qrbox: { width: 300, height: 150 },
      aspectRatio: 1.333334,
    },
    (decodedText) => {
      passValueInput.value = decodedText.trim();
      showStatus('Card scanned successfully.', 'success');
      html5QrCode.stop().then(() => {
        isScanning = false;
        readerContainer.classList.add('hidden');
        scanBtn.textContent = '📷 Scan Card';
      }).catch((error) => {
        console.error('Failed to stop scanner after decoding:', error);
      });
    },
    () => {
      // Ignore background scan errors while the camera is trying to detect a code.
    }
  )
    .then(() => {
      isScanning = true;
      scanBtn.textContent = '❌ Cancel Scan';
      showStatus('Camera is ready. Point it at a card.', 'info');
    })
    .catch((error) => {
      console.error('Camera error:', error);
      readerContainer.classList.add('hidden');
      showStatus('Camera access denied or unavailable.', 'error');
    });
}

scanBtn.addEventListener('click', handleScannerStart);
renderPasses();
showStatus('Ready to add a card.', 'info');
