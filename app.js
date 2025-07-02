// --- Warframe Relic Scanner: Minimal, Robust, and Fast ---
// Uses local Relics.json for structure, Warframe Market API for prices, and a cached slug map for lookups.

// UI Elements
const cameraScanBtn = document.getElementById('cameraScanBtn');
const uploadBtn = document.getElementById('uploadBtn');
const cameraInput = document.getElementById('cameraInput');
const uploadInput = document.getElementById('uploadInput');
const scanButton = document.getElementById('scanButton');
const manualEntryBtn = document.getElementById('manualEntryBtn');
const manualEntryContainer = document.getElementById('manualEntryContainer');
const manualScanBtn = document.getElementById('manualScanBtn');
const scanModeSelect = document.getElementById('scanMode');
const manualEntryControls = document.getElementById('manualEntryControls');
const manualEntryCount = document.getElementById('manualEntryCount');
const manualEntryCountUp = document.getElementById('manualEntryCountUp');
const manualEntryCountDown = document.getElementById('manualEntryCountDown');
const manualEntryFields = document.getElementById('manualEntryFields');

// --- Image Upload/Camera Logic ---
cameraScanBtn.addEventListener('click', () => {
  cameraInput.click();
  hideManualEntry();
});
uploadBtn.addEventListener('click', () => {
  uploadInput.click();
  hideManualEntry();
});
cameraInput.addEventListener('change', handleImageInput);
uploadInput.addEventListener('change', handleImageInput);

function handleImageInput(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = document.getElementById('imagePreview');
    img.src = e.target.result;
    img.style.display = 'block';
    scanButton.style.display = 'inline-block';
    document.getElementById('ocrResult').textContent = '';
    document.getElementById('priceResult').textContent = '';
  };
  reader.readAsDataURL(file);
}

// --- Helper: Render Manual Entry Fields ---
function renderManualEntryFields(count) {
  manualEntryFields.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const label = document.createElement('label');
    label.textContent = `Relic ${i + 1}: `;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'manual-relic';
    input.placeholder = 'e.g. Neo N9';
    label.appendChild(input);
    manualEntryFields.appendChild(label);
    manualEntryFields.appendChild(document.createElement('br'));
  }
}

// --- Hide Manual Entry When Switching Modes ---
function hideManualEntry() {
  manualEntryContainer.style.display = 'none';
  manualEntryControls.style.display = 'none';
}

// --- Manual Entry Logic ---
manualEntryBtn.addEventListener('click', function() {
  manualEntryContainer.style.display = 'block';
  document.getElementById('imagePreview').style.display = 'none';
  scanButton.style.display = 'none';
  document.getElementById('ocrResult').textContent = '';
  document.getElementById('priceResult').textContent = '';
  // Show/hide controls based on scan mode
  if (scanModeSelect.value === 'mass') {
    manualEntryControls.style.display = 'flex';
    renderManualEntryFields(Number(manualEntryCount.value));
  } else {
    manualEntryControls.style.display = 'none';
    renderManualEntryFields(4);
  }
});

// --- Mass Scan: Manual Entry Count Controls ---
function updateManualEntryCount(newCount) {
  manualEntryCount.value = newCount;
  renderManualEntryFields(newCount);
}
manualEntryCountUp.addEventListener('click', () => {
  let val = Number(manualEntryCount.value);
  if (val < 20) updateManualEntryCount(val + 1);
});
manualEntryCountDown.addEventListener('click', () => {
  let val = Number(manualEntryCount.value);
  if (val > 1) updateManualEntryCount(val - 1);
});
manualEntryCount.addEventListener('input', () => {
  let val = Number(manualEntryCount.value);
  if (isNaN(val) || val < 1) val = 1;
  if (val > 20) val = 20;
  updateManualEntryCount(val);
});

// --- React to Scan Mode Change ---
scanModeSelect.addEventListener('change', () => {
  // If manual entry is open, update controls/fields
  if (manualEntryContainer.style.display === 'block') {
    if (scanModeSelect.value === 'mass') {
      manualEntryControls.style.display = 'flex';
      renderManualEntryFields(Number(manualEntryCount.value));
    } else {
      manualEntryControls.style.display = 'none';
      renderManualEntryFields(4);
    }
  }
});

// --- Manual Scan Button Logic (with normalization) ---
manualScanBtn.addEventListener('click', async function() {
  const ocrResult = document.getElementById('ocrResult');
  const priceResult = document.getElementById('priceResult');
  ocrResult.textContent = '';
  priceResult.textContent = '';
  const inputs = Array.from(document.querySelectorAll('.manual-relic')).map(i => i.value.trim()).filter(Boolean);
  if (inputs.length === 0) {
    ocrResult.textContent = 'Please enter at least one relic.';
    return;
  }
  // Validate and normalize relic codes (case-insensitive, proper format)
  const validRelicRegex = /^(meso|lith|neo|axi)\s?[a-z][0-9]+$/i;
  function normalizeRelicCode(code) {
    // Normalize to: Capitalize era, uppercase letter, keep number
    const match = code.match(/^(meso|lith|neo|axi)\s*([a-zA-Z])\s*(\d+)$/i);
    if (!match) return code;
    return `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2].toUpperCase()}${match[3]}`;
  }
  const relics = inputs.map(r => r.replace(/\s+/, ' ')).map(normalizeRelicCode).filter(r => validRelicRegex.test(r));
  if (relics.length === 0) {
    ocrResult.textContent = 'Please enter valid relic codes (e.g. Neo N9).';
    return;
  }
  ocrResult.innerHTML = relics.map((r, idx) => `<div><strong>Relic ${idx + 1}:</strong> ${r}</div>`).join('');
  priceResult.innerHTML = 'Loading prices...';
  try {
    await showRelicPrices(relics, priceResult);
  } catch (err) {
    priceResult.innerHTML = `<span style='color:#f88'>Error loading relic data or prices: ${err.message}</span>`;
  }
});

// --- OCR Scan Logic ---
scanButton.addEventListener('click', async function() {
  const img = document.getElementById('imagePreview');
  const ocrResult = document.getElementById('ocrResult');
  const priceResult = document.getElementById('priceResult');
  const scanMode = document.getElementById('scanMode').value;
  ocrResult.textContent = 'Scanning... Please wait.';
  priceResult.textContent = '';
  try {
    const result = await Tesseract.recognize(img.src, 'eng');
    let ocrText = result.data.text.trim();
    // Preprocess: Remove 'x#' prefixes (e.g., 'x12 ')
    ocrText = ocrText.replace(/x\d+\s*/gi, '');
    // Extract relic codes (robust to extra spaces)
    const relicRegex = /(Meso|Lith|Neo|Axi)\s*[A-Z]\d+/gi;
    const matches = [];
    let match;
    while ((match = relicRegex.exec(ocrText)) !== null) {
      matches.push(match[0].replace(/\s+/, ' '));
    }
    // Group relics
    let grouped = [];
    if (scanMode === 'fissure') {
      for (let i = 0; i < 4; i++) grouped.push(matches.slice(i, i + 1));
    } else {
      for (let i = 0; i < matches.length; i++) grouped.push([matches[i]]);
    }
    ocrResult.innerHTML = grouped.map((group, idx) => `<div><strong>Relic ${idx + 1}:</strong> ${group.join(', ') || 'Not found'}</div>`).join('');
    priceResult.innerHTML = 'Loading prices...';
    try {
      await showRelicPrices(grouped.map(g => g[0]), priceResult);
    } catch (err) {
      priceResult.innerHTML = `<span style='color:#f88'>Error loading relic data or prices: ${err.message}</span>`;
    }
  } catch (err) {
    ocrResult.textContent = 'Error during OCR: ' + err.message;
    priceResult.textContent = '';
  }
});

// --- Relics Data and Slug Map ---
let RELICS_DATA = null;
let SLUG_MAP = null;
const SLUG_CACHE_KEY = 'wf_slug_map';
const SLUG_CACHE_TIME_KEY = 'wf_slug_map_time';
const SLUG_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 1 week

// Use the full API URL for price data fetches when running from GitHub Pages
const API_BASE_URL = 'https://wf-phone-scanner.onrender.com';

async function getRelicsData() {
  if (RELICS_DATA) return RELICS_DATA;
  let res;
  try {
    res = await fetch('Relics.json');
  } catch (e) {
    throw new Error('Failed to fetch Relics.json: ' + e.message);
  }
  if (!res.ok) {
    throw new Error('Failed to fetch Relics.json: HTTP ' + res.status + ' ' + res.statusText);
  }
  try {
    RELICS_DATA = await res.json();
  } catch (e) {
    throw new Error('Failed to parse Relics.json: ' + e.message);
  }
  return RELICS_DATA;
}

function normalizePartName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function getSlugMap() {
  // Check cache
  const cached = localStorage.getItem(SLUG_CACHE_KEY);
  const cachedTime = localStorage.getItem(SLUG_CACHE_TIME_KEY);
  if (cached && cachedTime && Date.now() - parseInt(cachedTime) < SLUG_CACHE_MAX_AGE) {
    SLUG_MAP = JSON.parse(cached);
    return SLUG_MAP;
  }
  // Fetch from API
  const resp = await fetch(`${API_BASE_URL}/api/items`);
  const items = (await resp.json()).payload.items;
  SLUG_MAP = {};
  items.forEach(item => {
    SLUG_MAP[normalizePartName(item.item_name)] = item.url_name;
  });
  localStorage.setItem(SLUG_CACHE_KEY, JSON.stringify(SLUG_MAP));
  localStorage.setItem(SLUG_CACHE_TIME_KEY, Date.now().toString());
  return SLUG_MAP;
}

function getSlugForPart(partName, slugMap) {
  const norm = normalizePartName(partName);
  return slugMap[norm] || null;
}

// --- Price Lookup and Display ---
async function showRelicPrices(relicCodes, priceResultElem) {
  const relicsData = await getRelicsData();
  const slugMap = await getSlugMap();
  const priceSections = [];
  for (const relicCode of relicCodes) {
    if (!relicCode) {
      priceSections.push(`<div><strong>Relic:</strong> Not found</div>`);
      continue;
    }
    const relicEntry = relicsData.find(r => r.name && r.name.startsWith(relicCode));
    if (!relicEntry) {
      priceSections.push(`<div><strong>${relicCode}:</strong> Not found in data</div>`);
      continue;
    }
    const partRows = await Promise.all(relicEntry.rewards
      .filter(r => !r.item.name.toLowerCase().includes('forma blueprint'))
      .map(async r => {
        const partName = r.item.name;
        const urlName = r.warframeMarket && r.warframeMarket.urlName ? r.warframeMarket.urlName : getSlugForPart(partName, slugMap);
        if (!urlName) {
          return `<div>${partName}: <span style='color:#f88'>Slug not found</span></div>`;
        }
        try {
          const res = await fetch(`${API_BASE_URL}/api/orders/${urlName}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText} (slug: ${urlName})`);
          const data = await res.json();
          if (!data.payload || !data.payload.orders) throw new Error('No orders');
          const sellIngame = data.payload.orders.filter(o => o.order_type === 'sell' && o.user.status === 'ingame');
          if (!sellIngame.length) {
            return `<div>${partName}: <span style='color:#aaa'>No ingame sellers</span></div>`;
          } else {
            const lowest = sellIngame.sort((a, b) => a.platinum - b.platinum).slice(0, 5);
            const avg = (lowest.reduce((sum, o) => sum + o.platinum, 0) / lowest.length).toFixed(1);
            return `<div>${partName}: <strong>${avg}p</strong></div>`;
          }
        } catch (e) {
          return `<div>${partName}: <span style='color:#f88'>${e.message}</span></div>`;
        }
      })
    );
    priceSections.push(`<div><strong>${relicCode} Parts & Prices:</strong><br>${partRows.join('')}</div>`);
  }
  priceResultElem.innerHTML = priceSections.join('<hr>');
}
