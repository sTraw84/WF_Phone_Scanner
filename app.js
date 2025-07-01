// ✅ app.js

// Button triggers for camera and upload
const cameraScanBtn = document.getElementById('cameraScanBtn');
const uploadBtn = document.getElementById('uploadBtn');
const cameraInput = document.getElementById('cameraInput');
const uploadInput = document.getElementById('uploadInput');

cameraScanBtn.addEventListener('click', function() {
  cameraInput.click();
});
uploadBtn.addEventListener('click', function() {
  uploadInput.click();
});

function handleImageInput(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = document.getElementById('imagePreview');
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById('scanButton').style.display = 'inline-block';
    document.getElementById('ocrResult').textContent = '';
    document.getElementById('priceResult').textContent = '';
  };
  reader.readAsDataURL(file);
}
cameraInput.addEventListener('change', handleImageInput);
uploadInput.addEventListener('change', handleImageInput);

// Handle OCR scan
const scanButton = document.getElementById('scanButton');
scanButton.addEventListener('click', async function() {
  const img = document.getElementById('imagePreview');
  const ocrResult = document.getElementById('ocrResult');
  const priceResult = document.getElementById('priceResult');
  const scanMode = document.getElementById('scanMode').value;
  ocrResult.textContent = 'Scanning... Please wait.';
  priceResult.textContent = '';
  try {
    const result = await Tesseract.recognize(
      img.src,
      'eng',
      { logger: m => { /* Optionally log progress */ } }
    );
    const ocrText = result.data.text.trim();
    // Utility: Levenshtein distance
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
    // Build all valid relic codes (A1-Z99 for each era)
    const validRelicCodes = [];
    ['Meso', 'Lith', 'Neo', 'Axi'].forEach(era => {
      for (let l = 65; l <= 90; l++) { // A-Z
        for (let n = 1; n <= 99; n++) {
          validRelicCodes.push(`${era} ${String.fromCharCode(l)}${n}`);
        }
      }
    });
    // Improved regex: extract only the main relic code (e.g., 'Neo A10')
    const relicRegex = /(Meso|Lith|Neo|Axi)\s?[A-Z]+\d+/gi;
    const matches = [];
    let match;
    while ((match = relicRegex.exec(ocrText)) !== null) {
      matches.push(match[0].replace(/\s+/, ' ')); // Normalize spacing
    }
    // Fuzzy matching for missed relics
    const words = ocrText.split(/\s+/);
    words.forEach(word => {
      if (matches.includes(word)) return;
      let best = null, bestDist = 3;
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
    let grouped = [];
    if (scanMode === 'fissure') {
      for (let i = 0; i < 4; i++) {
        grouped.push(matches.slice(i * 1, (i + 1) * 1)); // 1 relic per group for up to 4
      }
    } else {
      // Mass scan: group all found relics individually
      for (let i = 0; i < matches.length; i++) {
        grouped.push([matches[i]]);
      }
    }
    // Display grouped relics
    ocrResult.innerHTML = grouped.map((group, idx) =>
      `<div><strong>Relic ${idx + 1}:</strong> ${group.join(', ') || 'Not found'}</div>`
    ).join('');

    // Price lookup logic (re-added)
    priceResult.innerHTML = 'Loading prices...';
    const relicsData = await getRelicsData();

    // Determine if we should throttle (mass scan mode)
    const shouldThrottle = scanMode !== 'fissure';

    const priceSections = [];

    if (scanMode === 'fissure') {
      // 4-relic mode: parallelize all part fetches for speed
      const allFetches = grouped.map((group, idx) => {
        const relicCode = group[0];
        if (!relicCode) {
          return Promise.resolve(`<div><strong>Relic ${idx + 1}:</strong> No relic found</div>`);
        }
        const relicEntry = relicsData.find(r => r.name && r.name.startsWith(relicCode));
        if (!relicEntry) {
          return Promise.resolve(`<div><strong>${relicCode}:</strong> Not found in data</div>`);
        }
        // Fetch all parts in parallel (except Forma Blueprint)
        const partFetches = relicEntry.rewards
          .filter(r => !r.item.name.toLowerCase().includes('forma blueprint'))
          .map(async r => {
            const partName = r.item.name;
            let urlName = r.warframeMarket && r.warframeMarket.urlName;
            if (!urlName) {
              urlName = partName
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/&/g, 'and')
                .replace(/[^a-z0-9_]/g, '')
                .replace(/_blueprint$/, ''); // <-- Remove trailing _blueprint
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
          });
        return Promise.all(partFetches).then(partRows =>
          `<div><strong>${relicCode} Parts & Prices:</strong><br>${partRows.join('')}</div>`
        );
      });
      const allResults = await Promise.all(allFetches);
      priceResult.innerHTML = allResults.join('<hr>');
    } else {
      // Mass scan: sequential with throttling (as you already have)
      for (let idx = 0; idx < grouped.length; idx++) {
        const group = grouped[idx];
        const relicCode = group[0];
        if (!relicCode) {
          priceSections.push(`<div><strong>Relic ${idx + 1}:</strong> No relic found</div>`);
          continue;
        }
        const relicEntry = relicsData.find(r => r.name && r.name.startsWith(relicCode));
        if (!relicEntry) {
          priceSections.push(`<div><strong>${relicCode}:</strong> Not found in data</div>`);
          continue;
        }
        const partRows = [];
        for (const r of relicEntry.rewards) {
          const partName = r.item.name;
          if (partName.toLowerCase().includes('forma blueprint')) continue;
          let urlName = r.warframeMarket && r.warframeMarket.urlName;
          if (!urlName) {
            urlName = partName
              .toLowerCase()
              .replace(/\s+/g, '_')
              .replace(/&/g, 'and')
              .replace(/[^a-z0-9_]/g, '')
              .replace(/_blueprint$/, ''); // <-- Remove trailing _blueprint
          }
          try {
            const res = await fetch(`/api/orders/${urlName}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText} (slug: ${urlName})`);
            const data = await res.json();
            if (!data.payload || !data.payload.orders) throw new Error('No orders');
            const sellIngame = data.payload.orders.filter(o => o.order_type === 'sell' && o.user.status === 'ingame');
            if (!sellIngame.length) {
              partRows.push(`<div>${partName}: <span style='color:#aaa'>No ingame sellers</span></div>`);
            } else {
              const lowest = sellIngame.sort((a, b) => a.platinum - b.platinum).slice(0, 5);
              const avg = (lowest.reduce((sum, o) => sum + o.platinum, 0) / lowest.length).toFixed(1);
              partRows.push(`<div>${partName}: <strong>${avg}p</strong></div>`);
            }
          } catch (e) {
            partRows.push(`<div>${partName}: <span style='color:#f88'>${e.message}</span></div>`);
          }
          await sleep(250); // Throttle for mass scan
        }
        priceSections.push(`<div><strong>${relicCode} Parts & Prices:</strong><br>${partRows.join('')}</div>`);
      }
      priceResult.innerHTML = priceSections.join('<hr>');
    }
  } catch (err) {
    ocrResult.textContent = 'Error during OCR: ' + err.message;
    priceResult.textContent = '';
  }
});

// Manual entry logic
const manualEntryBtn = document.getElementById('manualEntryBtn');
const manualEntryContainer = document.getElementById('manualEntryContainer');
const manualScanBtn = document.getElementById('manualScanBtn');

// Show manual entry, hide others
manualEntryBtn.addEventListener('click', function() {
  manualEntryContainer.style.display = 'block';
  document.getElementById('imagePreview').style.display = 'none';
  scanButton.style.display = 'none';
  document.getElementById('ocrResult').textContent = '';
  document.getElementById('priceResult').textContent = '';
});

// Manual scan logic
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
  // Display entered relics
  ocrResult.innerHTML = relics.map((r, idx) => `<div><strong>Relic ${idx + 1}:</strong> ${r}</div>`).join('');
  // Price lookup logic (reuse fissure logic)
  priceResult.innerHTML = 'Loading prices...';
  const relicsData = await getRelicsData();
  const allFetches = relics.map((relicCode, idx) => {
    const relicEntry = relicsData.find(r => r.name && r.name.startsWith(relicCode));
    if (!relicEntry) {
      return Promise.resolve(`<div><strong>${relicCode}:</strong> Not found in data</div>`);
    }
    const partFetches = relicEntry.rewards
      .filter(r => !r.item.name.toLowerCase().includes('forma blueprint'))
      .map(async r => {
        const partName = r.item.name;
        let urlName = r.warframeMarket && r.warframeMarket.urlName;
        if (!urlName) {
          urlName = partName
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/&/g, 'and')
            .replace(/[^a-z0-9_]/g, '')
            .replace(/_blueprint$/, ''); // <-- Remove trailing _blueprint
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
      });
    return Promise.all(partFetches).then(partRows =>
      `<div><strong>${relicCode} Parts & Prices:</strong><br>${partRows.join('')}</div>`
    );
  });
  const allResults = await Promise.all(allFetches);
  priceResult.innerHTML = allResults.join('<hr>');
});

// Utility: sleep for throttling
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- FIX: Ensure Relics.json is loaded before any price lookup ---
// Move relicsData loading to a single place and always await it before price lookups

let relicsDataPromise = null;
function getRelicsData() {
  if (!relicsDataPromise) {
    relicsDataPromise = fetch('Relics.json')
      .then(res => res.json())
      .catch(() => []);
  }
  return relicsDataPromise;
}
