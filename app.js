// 1. Register Service Worker (Fixed path for GitHub Pages)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
  });
}

// 2. Scanner Logic
const scanBtn = document.getElementById('btn-scan');
const readerDiv = document.getElementById('reader');
const passValueInput = document.getElementById('pass-value');
let html5QrCode;
let isScanning = false;

scanBtn.addEventListener('click', () => {
  if (!html5QrCode) {
    // Explicitly support common 1D barcodes and QR codes
    html5QrCode = new Html5Qrcode("reader");
  }

  if (isScanning) {
    // Stop scanning
    html5QrCode.stop().then(() => {
      isScanning = false;
      readerDiv.classList.add('hidden');
      scanBtn.innerHTML = '📷 Scan Card';
    });
  } else {
    // Start scanning
    readerDiv.classList.remove('hidden');
    html5QrCode.start(
      { facingMode: "environment" },
      // Removed 'qrbox' to scan the entire frame. Much better for wide 1D barcodes.
      { fps: 15 },
      (decodedText) => {
        // On successful scan
        passValueInput.value = decodedText;
        html5QrCode.stop().then(() => {
          isScanning = false;
          readerDiv.classList.add('hidden');
          scanBtn.innerHTML = '📷 Scan Card';
        });
      },
      (errorMessage) => {
        // Ignore background scanning errors
      }
    ).then(() => {
      isScanning = true;
      scanBtn.innerHTML = '❌ Cancel Scan';
    }).catch(err => {
      alert("Camera access denied or unavailable.");
      readerDiv.classList.add('hidden');
    });
  }
});

// 3. Wallet Logic & State
const form = document.getElementById('add-pass-form');
const container = document.getElementById('wallet-container');
let passes = JSON.parse(localStorage.getItem('wallet_passes')) || [];
let expandedIndex = null;

function toggleCard(index) {
  expandedIndex = expandedIndex === index ? null : index;
  renderPasses();
}

window.toggleCode = (index) => {
  const barcodeEl = document.getElementById(`barcode-${index}`);
  const qrEl = document.getElementById(`qr-${index}`);
  
  if (barcodeEl.classList.contains('hidden')) {
    barcodeEl.classList.remove('hidden');
    qrEl.classList.add('hidden');
  } else {
    barcodeEl.classList.add('hidden');
    qrEl.classList.remove('hidden');
  }
};

window.removePass = (index) => {
  const challenge = Math.random().toString(36).substring(2, 6).toUpperCase();
  const userInput = prompt(`To delete this pass, type this exact code: ${challenge}`);
  
  if (userInput === challenge) {
    passes.splice(index, 1);
    expandedIndex = null;
    localStorage.setItem('wallet_passes', JSON.stringify(passes));
    renderPasses();
  } else if (userInput !== null) {
    alert("Incorrect code. Deletion cancelled.");
  }
};

function renderPasses() {
  container.innerHTML = '';
  
  passes.forEach((pass, index) => {
    const card = document.createElement('div');
    
    if (expandedIndex === index) {
      card.className = 'pass-card expanded';
      card.innerHTML = `
        <h3>${pass.title}</h3>
        <div class="code-toggle" onclick="toggleCode(${index})">
          <div id="barcode-${index}" class="barcode-container">
            <svg class="barcode" data-value="${pass.value}"></svg>
          </div>
          <div id="qr-${index}" class="qr-container hidden"></div>
          <p class="tap-hint">Tap code to switch (Barcode / QR)</p>
        </div>
        <div class="pass-code">${pass.value}</div>
        <div class="button-group">
          <button class="btn-close" onclick="toggleCard(${index})">Close</button>
          <button class="btn-delete" onclick="removePass(${index})">Delete</button>
        </div>
      `;
      container.appendChild(card);

      const svg = card.querySelector('.barcode');
      try {
        JsBarcode(svg, pass.value, { format: "CODE128", width: 2, height: 60, displayValue: false, background: "#ffffff", lineColor: "#000000", margin: 5 });
      } catch (e) {
        svg.outerHTML = `<p class="error">Invalid barcode data</p>`;
      }

      const qrContainer = card.querySelector(`#qr-${index}`);
      try {
        new QRCode(qrContainer, { text: pass.value, width: 120, height: 120, colorDark: "#000000", colorLight: "#ffffff" });
      } catch (e) {
        qrContainer.innerHTML = `<p class="error">Invalid QR data</p>`;
      }

    } else {
      card.className = 'pass-card collapsed';
      card.onclick = () => toggleCard(index);
      card.innerHTML = `<div class="card-icon">💳</div><h3>${pass.title}</h3>`;
      container.appendChild(card);
    }
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('pass-title').value;
  const value = passValueInput.value;
  
  passes.push({ title, value });
  localStorage.setItem('wallet_passes', JSON.stringify(passes));
  
  form.reset();
  renderPasses();
});

renderPasses();
