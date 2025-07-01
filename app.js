// app.js

let relicsData = null;
let relicsDataPromise = null;

// Load relics data once, returns a promise that resolves to relics data
async function loadRelicsData() {
  if (relicsData) return relicsData;
  if (relicsDataPromise) return relicsDataPromise;

  relicsDataPromise = fetch('Relics.json')
    .then(res => res.json())
    .then(data => {
      relicsData = data;
      return data;
    })
    .catch(() => {
      relicsData = [];
      return [];
    });

  return relicsDataPromise;
}

// Throttle async function with concurrency limit
async function throttleAsync(items, concurrency, asyncFn) {
  const results = [];
  const executing = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => asyncFn(item));
    results.push(p);

    const e = p.then(() => executing.splice(executing.indexOf(e), 1));
    executing.push(e);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

// DOM Elements
const cameraScanBtn = document.getElementById('cameraScanBtn');
const uploadBtn = document.getElementById('uploadBtn');
const cameraInput = document.getElementById('cameraInput');
const uploadInput = document.getElementById('uploadInput');
const scanButton = document.getElementById('scanButton');
const imagePreview = document.getElementById('imagePreview');
const ocrResult = document.getElementById('ocrResult');
const priceResult = document.getElementById('priceResult');
const scanModeSelect = document.getElementById('scanMode');

// Button triggers to open file selectors
cameraScanBtn.addEventListener('click', () => cameraInput.click());
uploadBtn.addEventListener('click', () => uploadInput.click());

// Handle image input and show preview
function handleImageInput(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    imagePreview.style.display = 'block';
    scanButton.style.display = 'inline-block';
    ocrResult.textContent = '';
    priceResult.textContent = '';
  };
  reader.readAsDataURL(file);
}

cameraInput.addEventListener('change', handleImageInput);
uploadInput.addEventListener('change', handleImageInput);

// Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => []);
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }
  return matrix[a.length][b.length];
}

// Generate valid relic codes (e.g. "Lith A1", "Neo Z99")
const validRelicCodes = [];
['Meso', 'Lith', 'Neo', 'Axi'].forEach(era => {
  for (let l = 65; l <= 90; l++) { // ASCII A-Z
    for (let n = 1; n <= 99; n++) {
      validRelicCodes.push(`${era} ${String.fromCharCode(l)}${n}`);
    }
  }
});

scanButton.addEventListener('click', async () => {
  scanButton.disabled = true;
  ocrResult.textContent = 'Scanning... Please wait.';
  priceResult.textContent = '';

  try {
    // OCR with Tesseract.js
    const result = await Tesseract.recognize(imagePreview.src, 'eng', { logger: () => {} });
    const ocrText = result.data.text.trim();

    // Extract relic codes using regex
    const relicRegex = /(Meso|Lith|Neo|Axi)\s?[A-Z][0-9]+/g;
    const matches = [];
    let match;
    while ((match = relicRegex.exec(ocrText)) !== null) {
      matches.push(match[0].replace(/\s+/, ' ')); // Normalize spaces
    }

    // Fuzzy matching for missed relics
    const words = ocrText.split(/\s+/);
    words.forEach(word => {
      if (matches.includes(word)) return;
      let best = null;
      let bestDist = 3; // max allowed distance
      validRelicCodes.forEach(code => {
        const dist = levenshtein(word, code.replace(' ', ''));
        if (dist < bestDist) {
          best = code;
          bestDist = dist;
        }
      });
      if (best && bestDist <= 1 && !matches.includes(best)) {
        matches.push(best);
      }
    });

    // Group relics based on scan mode
    const scanMode = scanModeSelect.value;
    let grouped = [];
    if (scanMode === 'fissure') {
      // Group into 4 relics of 1 each
      for (let i = 0; i < 4; i++) {
        grouped.push(matches.slice(i, i + 1));
      }
    } else {
      grouped = matches.map(m => [m]);
    }

    // Display grouped relics in OCR result
    ocrResult.innerHTML = grouped.map((group, idx) =>
      `<div><strong>Relic ${idx + 1}:</strong> ${group.join(', ') || 'Not found'}</div>`
    ).join('');

    priceResult.innerHTML = 'Loading prices...';

    // Load relic data
    const relicsData = await loadRelicsData();

    // Fetch prices for each grouped relic with concurrency throttle
    const priceSections = await Promise.all(grouped.map(async (group, idx) => {
      const relicCode = group[0];
      if (!relicCode) return `<div><strong>Relic ${idx + 1}:</strong> No relic found</div>`;

      // Find relic entry in data by name start
      const relicEntry = relicsData.find(r => r.name && r.name.startsWith(relicCode));
      if (!relicEntry) return `<div><strong>${relicCode}:</strong> Not found in data</div>`;

      // Fetch price data for each reward with concurrency = 2
      const partRows = await throttleAsync(relicEntry.rewards, 2, async (r) => {
        const partName = r.item.name;
        let urlName = r.warframeMarket && r.warframeMarket.urlName;
        if (!urlName) {
          urlName = partName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        }
        try {
          const res = await fetch(`https://wf-phone-scanner.onrender.com/api/orders/${urlName}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText} (slug: ${urlName})`);
          const data = await res.json();
          if (!data.payload || !data.payload.orders) throw new Error('No orders');

          // Filter sell + ingame orders
          const sellIngame = data.payload.orders.filter(o => o.order_type === 'sell' && o.user.status === 'ingame');
          if (!sellIngame.length) return `<div>${partName}: <span style="color:#aaa">No ingame sellers</span></div>`;

          // Sort and average lowest 5 prices
          const lowest = sellIngame.sort((a, b) => a.platinum - b.platinum).slice(0, 5);
          const avg = (lowest.reduce((sum, o) => sum + o.platinum, 0) / lowest.length).toFixed(1);
          return `<div>${partName}: <strong>${avg}p</strong></div>`;
        } catch (e) {
          return `<div>${partName}: <span style="color:#f88">${e.message}</span></div>`;
        }
      });

      return `<div><strong>${relicCode} Parts & Prices:</strong><br>${partRows.join('')}</div>`;
    }));

    priceResult.innerHTML = priceSections.join('<hr>');

  } catch (err) {
    ocrResult.textContent = 'Error during OCR: ' + err.message;
    priceResult.textContent = '';
  } finally {
    scanButton.disabled = false;
  }
});
