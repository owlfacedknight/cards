const STORAGE_KEY = 'wallet_passes';
const form = document.getElementById('add-pass-form');
const container = document.getElementById('wallet-container');
const statusMessage = document.getElementById('status-message');
const passTitleInput = document.getElementById('pass-title');
const passValueInput = document.getElementById('pass-value');
const refreshBtn = document.getElementById('btn-refresh');

let passes = loadPasses();
let expandedIndex = null;
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
    if (!storedPasses) return [];

    const parsed = JSON.parse(storedPasses);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((pass) =>
      pass && typeof pass.title === 'string' && typeof pass.value === 'string'
    );
  } catch (error) {
    console.error('Failed to load wallet cards:', error);
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
  const barcode = document.getElementById(`barcode-${index}`);
  const qr = document.getElementById(`qr-${index}`);
  if (!barcode || !qr) return;

  const showBarcode = barcode.classList.contains('hidden');
  barcode.classList.toggle('hidden', !showBarcode);
  qr.classList.toggle('hidden', showBarcode);
}

function removePass(index) {
  const title = passes[index]?.title || 'this card';
  if (!window.confirm(`Remove “${title}” from your wallet?`)) return;

  passes.splice(index, 1);
  expandedIndex = null;
  persistPasses();
  renderPasses();
  showStatus('Card removed.', 'success');
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

form.addEventListener('submit', (event) => {
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

  passes.push({ title, value });
  persistPasses();
  expandedIndex = passes.length - 1;
  form.reset();
  renderPasses();
  showStatus('Card added to your wallet.', 'success');
  passTitleInput.focus();
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

renderPasses();
