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

// --- Image Upload/Camera Logic ---
cameraScanBtn.addEventListener('click', () => cameraInput.click());
uploadBtn.addEventListener('click', () => uploadInput.click());
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

// --- Manual Entry Logic ---
manualEntryBtn.addEventListener('click', function() {
  manualEntryContainer.style.display = 'block';
  document.getElementById('imagePreview').style.display = 'none';
  scanButton.style.display = 'none';
  document.getElementById('ocrResult').textContent = '';
  document.getElementById('priceResult').textContent = '';
});

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
  // Validate and normalize relic codes
  const validRelicRegex = /^(Meso|Lith|Neo|Axi)\s?[A-Z][0-9]+$/i;
  const relics = inputs.map(r => r.replace(/\s+/, ' ')).filter(r => validRelicRegex.test(r));
  if (relics.length === 0) {
    ocrResult.textContent = 'Please enter valid relic codes (e.g. Neo N9).';
    return;
  }
  ocrResult.innerHTML = relics.map((r, idx) => `<div><strong>Relic ${idx + 1}:</strong> ${r}</div>`).join('');
  priceResult.innerHTML = 'Loading prices...';
  await showRelicPrices(relics, priceResult);
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
    const ocrText = result.data.text.trim();
    // Extract relic codes
    const relicRegex = /(Meso|Lith|Neo|Axi)\s?[A-Z]+\d+/gi;
    const matches = [];
    let match;
    while ((match = relicRegex.exec(ocrText)) !== null) {
      matches.push(match[0].replace(/\s+/, ' '));
    }
    // Fuzzy fallback for missed relics (optional, can be removed for minimalism)
    // ...
    // Group relics
    let grouped = [];
    if (scanMode === 'fissure') {
      for (let i = 0; i < 4; i++) grouped.push(matches.slice(i, i + 1));
    } else {
      for (let i = 0; i < matches.length; i++) grouped.push([matches[i]]);
    }
    ocrResult.innerHTML = grouped.map((group, idx) => `<div><strong>Relic ${idx + 1}:</strong> ${group.join(', ') || 'Not found'}</div>`).join('');
    priceResult.innerHTML = 'Loading prices...';
    await showRelicPrices(grouped.map(g => g[0]), priceResult);
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

async function getRelicsData() {
  if (RELICS_DATA) return RELICS_DATA;
  const res = await fetch('Relics.json');
  RELICS_DATA = await res.json();
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
  const resp = await fetch('https://api.warframe.market/v1/items');
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
          const res = await fetch(`/api/orders/${urlName}`);
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
