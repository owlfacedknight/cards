// Register Service Worker for Offline Mode
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered'))
      .catch(err => console.error('Service Worker failure:', err));
  });
}

// Wallet Logic
const form = document.getElementById('add-pass-form');
const container = document.getElementById('wallet-container');
let passes = JSON.parse(localStorage.getItem('wallet_passes')) || [];

function renderPasses() {
  container.innerHTML = '';
  passes.forEach((pass, index) => {
    const card = document.createElement('div');
    card.className = 'pass-card';
    card.innerHTML = `
      <h3>${pass.title}</h3>
      <div class="barcode-container">
        <svg class="barcode" data-value="${pass.value}"></svg>
      </div>
      <div class="pass-code">${pass.value}</div>
      <button onclick="removePass(${index})">Delete</button>
    `;
    container.appendChild(card);
  });

  // Generate barcodes for all rendered cards
  document.querySelectorAll('.barcode').forEach(svg => {
    const value = svg.getAttribute('data-value');
    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: false,
        background: "#ffffff",
        lineColor: "#000000",
        margin: 5
      });
    } catch (e) {
      svg.outerHTML = `<p style="color:red; font-size:12px;">Invalid barcode data</p>`;
    }
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('pass-title').value;
  const value = document.getElementById('pass-value').value;
  
  passes.push({ title, value });
  localStorage.setItem('wallet_passes', JSON.stringify(passes));
  
  form.reset();
  renderPasses();
});

window.removePass = (index) => {
  passes.splice(index, 1);
  localStorage.setItem('wallet_passes', JSON.stringify(passes));
  renderPasses();
};

// Initial Render
renderPasses();
