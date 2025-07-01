// ======= app.js =======
document.addEventListener('DOMContentLoaded', async () => {
  // Wait for slugMap to load first
  let slugMap = await getSlugMap();

  // Load relics data
  let relicsData = [];
  fetch('Relics.json')
    .then(res => res.json())
    .then(data => { relicsData = data; })
    .catch(() => { relicsData = []; });

  let scanMode = null;

  const modeSelect = document.getElementById('modeSelect');
  const scanSection = document.getElementById('scanSection');
  const scanBtn = document.getElementById('scanBtn');
  const uploadBtn = document.getElementById('uploadBtn');
  const cameraInput = document.getElementById('cameraInput');
  const uploadInput = document.getElementById('uploadInput');
  const scanButton = document.getElementById('scanButton');
  const imagePreview = document.getElementById('imagePreview');
  const ocrResult = document.getElementById('ocrResult');
  const priceResult = document.getElementById('priceResult');

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

  scanBtn.onclick = () => cameraInput.click();
  uploadBtn.onclick = () => uploadInput.click();

  function handleImageInput(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
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

  scanButton.addEventListener('click', async () => {
    ocrResult.textContent = 'Scanning... Please wait.';
    priceResult.textContent = '';
    try {
      const result = await Tesseract.recognize(imagePreview.src, 'eng');
      const ocrText = result.data.text.trim();
      const validRelicCodes = [];
      ['Meso', 'Lith', 'Neo', 'Axi'].forEach(era => {
        for (let l = 65; l <= 90; l++) {
          for (let n = 1; n <= 99; n++) {
            validRelicCodes.push(`${era} ${String.fromCharCode(l)}${n}`);
          }
        }
      });
      const relicRegex = /(Meso|Lith|Neo|Axi)\s?[A-Z][0-9]+/g;
      const matches = [];
      let match;
      while ((match = relicRegex.exec(ocrText)) !== null) {
        matches.push(match[0].replace(/\s+/, ' '));
      }
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
      let grouped = scanMode === 'fissure' ? Array.from({ length: 4 }, (_, i) => matches.slice(i, i + 1)) : matches.map(m => [m]);
      ocrResult.innerHTML = grouped.map((group, idx) => `<div><strong>Relic ${idx + 1}:</strong> ${group.join(', ') || 'Not found'}</div>`).join('');
      const relicDelay = scanMode === 'mass' ? 1000 : 500;
      const partDelay = scanMode === 'mass' ? 1000 : 500;
      async function fetchWithThrottle(tasks, delayMs) {
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
          const urlName = slugMap[partName.toLowerCase()] || findBestSlug(partName, slugMap);
          try {
            const res = await fetch(`https://wf-phone-scanner.onrender.com/api/orders/${urlName}`, {
              headers: {
                'User-Agent': 'sjtrawick@gmail.com',
                'Accept': 'application/json'
              }
            });
            if (res.status === 404) return `<div>${partName}: <span style='color:#aaa'>Not tradable</span></div>`;
            if (res.status === 429) return `<div>${partName}: <span style='color:#f88'>Rate limited</span></div>`;
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const data = await res.json();
            const sellIngame = data.payload.orders.filter(o => o.order_type === 'sell' && o.user.status === 'ingame');
            if (!sellIngame.length) return `<div>${partName}: <span style='color:#aaa'>No ingame sellers</span></div>`;
            const lowest = sellIngame.sort((a, b) => a.platinum - b.platinum).slice(0, 5);
            const avg = (lowest.reduce((sum, o) => sum + o.platinum, 0) / lowest.length).toFixed(1);
            return `<div>${partName}: <strong>${avg}p</strong></div>`;
          } catch (e) {
            return `<div>${partName}: <span style='color:#f88'>${e.message}</span></div>`;
          }
        }), partDelay);
        return `<div><strong>${relicCode} Parts & Prices:</strong><br>${partRows.join('')}</div>`;
      }), relicDelay);
      priceResult.innerHTML = priceSections.join('<hr>');
    } catch (err) {
      ocrResult.textContent = 'OCR Error: ' + err.message;
      priceResult.textContent = '';
    }
  });

  async function getSlugMap() {
    const cache = localStorage.getItem('slugMap');
    const cacheTime = localStorage.getItem('slugMapTime');
    if (cache && cacheTime && Date.now() - cacheTime < 24 * 60 * 60 * 1000) {
      return JSON.parse(cache);
    }
    const res = await fetch('https://api.warframe.market/v1/items', {
      headers: {
        'User-Agent': 'sjtrawick@gmail.com',
        'Accept': 'application/json'
      }
    });
    const data = await res.json();
    const map = {};
    data.payload.items.forEach(item => {
      map[item.item_name.toLowerCase()] = item.url_name;
    });
    localStorage.setItem('slugMap', JSON.stringify(map));
    localStorage.setItem('slugMapTime', Date.now());
    return map;
  }

  function levenshtein(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => []);
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        matrix[i][j] = a[i - 1] === b[j - 1] ? matrix[i - 1][j - 1] : Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
    return matrix[a.length][b.length];
  }

  function findBestSlug(partName, slugMap) {
    const lower = partName.toLowerCase();
    if (slugMap[lower]) return slugMap[lower];
    let best = null, bestDist = 3;
    for (const name in slugMap) {
      const dist = levenshtein(lower, name);
      if (dist < bestDist) {
        best = name;
        bestDist = dist;
      }
    }
    return best ? slugMap[best] : lower.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }
});
