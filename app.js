// Load relics data
let relicsData = [];
fetch('Relics.json')
  .then(res => res.json())
  .then(data => { relicsData = data; })
  .catch(() => { relicsData = []; });

let scanMode = null;

// Mode selection logic
const modeSelect = document.getElementById('modeSelect');
const scanSection = document.getElementById('scanSection');
document.getElementById('fissureModeBtn').onclick = () => {
  scanMode = 'fissure';
  modeSelect.style.display = 'none';
  scanSection.style.display = 'block';
};
document.getElementById('massModeBtn').onclick = () => {
  scanMode = 'mass';
  modeSelect.style.display = 'none';
  scanSection.style.display = 'block';
};

// Scan/Upload button logic
const scanBtn = document.getElementById('scanBtn');
const uploadBtn = document.getElementById('uploadBtn');
const cameraInput = document.getElementById('cameraInput');
const uploadInput = document.getElementById('uploadInput');

scanBtn.onclick = () => cameraInput.click();
uploadBtn.onclick = () => uploadInput.click();

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
    const relicRegex = /(Meso|Lith|Neo|Axi)\s?[A-Z][0-9]+/g;
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
    // Grouping logic based on mode
    let grouped = [];
    if (scanMode === 'fissure') {
      for (let i = 0; i < 4; i++) {
        grouped.push(matches.slice(i * 1, (i + 1) * 1));
      }
    } else {
      // Mass scan: group each found relic individually
      for (let i = 0; i < matches.length; i++) {
        grouped.push([matches[i]]);
      }
    }
    // Display grouped relics
    ocrResult.innerHTML = grouped.map((group, idx) =>
      `<div><strong>Relic ${idx + 1}:</strong> ${group.join(', ') || 'Not found'}</div>`
    ).join('');
    // For each found relic, find its drops and display part names and prices
    priceResult.innerHTML = 'Loading prices...';
    // Throttle requests to 1 per second
    async function fetchWithThrottle(tasks, delayMs = 1000) {
      const results = [];
      for (const task of tasks) {
        results.push(await task());
        await new Promise(r => setTimeout(r, delayMs));
      }
      return results;
    }
    const priceSections = await fetchWithThrottle(grouped.map(group => async () => {
      const relicCode = group[0];
      if (!relicCode) return `<div><strong>Relic ${grouped.indexOf(group) + 1}:</strong> No relic found</div>`;
      const relicEntry = relicsData.find(r => r.name && r.name.startsWith(relicCode));
      if (!relicEntry) return `<div><strong>${relicCode}:</strong> Not found in data</div>`;
      const partRows = await fetchWithThrottle(relicEntry.rewards.map(r => async () => {
        const partName = r.item.name;
        let urlName = null;
        // Try to get the slug from the fetched slugMap
        if (slugMap[partName.toLowerCase()]) {
          urlName = slugMap[partName.toLowerCase()];
        } else if (r.warframeMarket && r.warframeMarket.urlName) {
          urlName = r.warframeMarket.urlName;
        } else {
          urlName = partName
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '');
        }
        try {
          const res = await fetch(`https://wf-phone-scanner.onrender.com/api/orders/${urlName}`);
          if (res.status === 404) {
            return `<div>${partName}: <span style='color:#aaa'>Not tradable on market</span></div>`;
          }
          if (res.status === 429) {
            return `<div>${partName}: <span style='color:#f88'>Rate limited, please try again later</span></div>`;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText} (slug: ${urlName})`);
          const data = await res.json();
          if (!data.payload || !data.payload.orders) throw new Error('No orders');
          const sellIngame = data.payload.orders.filter(o => o.order_type === 'sell' && o.user.status === 'ingame');
          if (!sellIngame.length) return `<div>${partName}: <span style='color:#aaa'>No ingame sellers</span></div>`;
          const lowest = sellIngame.sort((a, b) => a.platinum - b.platinum).slice(0, 5);
          const avg = (lowest.reduce((sum, o) => sum + o.platinum, 0) / lowest.length).toFixed(1);
          return `<div>${partName}: <strong>${avg}p</strong></div>`;
        } catch (e) {
          return `<div>${partName}: <span style='color:#f88'>${e.message}</span></div>`;
        }
      }), 1000); // 1 request per second for parts
      return `<div><strong>${relicCode} Parts & Prices:</strong><br>${partRows.join('')}</div>`;
    }), 1000); // 1 request per second for relics
    priceResult.innerHTML = priceSections.join('<hr>');
  } catch (err) {
    ocrResult.textContent = 'Error during OCR: ' + err.message;
    priceResult.textContent = '';
  }
});

// 1. Fetch and cache slugs
async function getSlugMap() {
  const cache = localStorage.getItem('slugMap');
  const cacheTime = localStorage.getItem('slugMapTime');
  if (cache && cacheTime && Date.now() - cacheTime < 24 * 60 * 60 * 1000) {
    return JSON.parse(cache);
  }
  const res = await fetch('https://api.warframe.market/v1/items');
  const data = await res.json();
  const map = {};
  data.payload.items.forEach(item => {
    map[item.item_name.toLowerCase()] = item.url_name;
  });
  localStorage.setItem('slugMap', JSON.stringify(map));
  localStorage.setItem('slugMapTime', Date.now());
  return map;
}

// 2. Fuzzy matching (Levenshtein)
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

// 3. Find best slug for a part name
function findBestSlug(partName, slugMap) {
  const lower = partName.toLowerCase();
  if (slugMap[lower]) return slugMap[lower];
  // Fuzzy match
  let best = null, bestDist = 3;
  for (const name in slugMap) {
    const dist = levenshtein(lower, name);
    if (dist < bestDist) {
      best = name;
      bestDist = dist;
    }
  }
  if (best) return slugMap[best];
  // Fallback
  return lower.replace(/\\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// 4. Usage in your app
const slugMap = await getSlugMap();
const slug = findBestSlug(ocrPartName, slugMap);
// Use slug in your API call 
