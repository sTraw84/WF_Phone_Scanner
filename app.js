// ✅ app.js
let relicsData = [];
fetch('Relics.json')
  .then(res => res.json())
  .then(data => { relicsData = data; })
  .catch(() => { relicsData = []; });

// Image input handlers
const scanBtn = document.getElementById('scanBtn');
const uploadBtn = document.getElementById('uploadBtn');
const cameraInput = document.getElementById('cameraInput');
const uploadInput = document.getElementById('uploadInput');
const imagePreview = document.getElementById('imagePreview');
const scanButton = document.getElementById('scanButton');
const ocrResult = document.getElementById('ocrResult');
const priceResult = document.getElementById('priceResult');

scanBtn.addEventListener('click', () => cameraInput.click());
uploadBtn.addEventListener('click', () => uploadInput.click());
cameraInput.addEventListener('change', handleImageInput);
uploadInput.addEventListener('change', handleImageInput);

function handleImageInput(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    imagePreview.src = e.target.result;
    imagePreview.style.display = 'block';
    scanButton.style.display = 'inline-block';
    ocrResult.textContent = '';
  };
  reader.readAsDataURL(file);
}

// OCR and data fetch
scanButton.addEventListener('click', async function() {
  ocrResult.textContent = 'Scanning... Please wait.';
  priceResult.textContent = '';
  try {
    const result = await Tesseract.recognize(
      imagePreview.src,
      'eng',
      { logger: m => {} }
    );
    const ocrText = result.data.text.trim();

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

    const grouped = [];
    for (let i = 0; i < 4; i++) {
      grouped.push(matches.slice(i, i + 1));
    }

    ocrResult.innerHTML = grouped.map((group, idx) =>
      `<div><strong>Relic ${idx + 1}:</strong> ${group.join(', ') || 'Not found'}</div>`
    ).join('');

    priceResult.innerHTML = 'Loading prices...';
    const priceSections = await Promise.all(grouped.map(async (group, idx) => {
      const relicCode = group[0];
      if (!relicCode) return `<div><strong>Relic ${idx + 1}:</strong> No relic found</div>`;
      const relicEntry = relicsData.find(r => r.name && r.name.startsWith(relicCode));
      if (!relicEntry) return `<div><strong>${relicCode}:</strong> Not found in data</div>`;

      const partRows = await Promise.all(relicEntry.rewards.map(async r => {
        const partName = r.item.name;
        let urlName = r.warframeMarket?.urlName || partName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

        try {
          const res = await fetch(`https://wf-phone-scanner.onrender.com/api/orders/${urlName}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (!data.payload?.orders) throw new Error('No orders');

          const sellIngame = data.payload.orders.filter(o => o.order_type === 'sell' && o.user.status === 'ingame');
          if (!sellIngame.length) return `<div>${partName}: <span style='color:#aaa'>No ingame sellers</span></div>`;

          const lowest = sellIngame.sort((a, b) => a.platinum - b.platinum).slice(0, 5);
          const avg = (lowest.reduce((sum, o) => sum + o.platinum, 0) / lowest.length).toFixed(1);
          return `<div>${partName}: <strong>${avg}p</strong></div>`;
        } catch (e) {
          return `<div>${partName}: <span style='color:#f88'>${e.message}</span></div>`;
        }
      }));

      return `<div><strong>${relicCode} Parts & Prices:</strong><br>${partRows.join('')}</div>`;
    }));

    priceResult.innerHTML = priceSections.join('<hr>');
  } catch (err) {
    ocrResult.textContent = 'Error during OCR: ' + err.message;
    priceResult.textContent = '';
  }
});
