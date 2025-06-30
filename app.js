// Load relics data
let relicsData = [];
fetch('Relics.json')
  .then(res => res.json())
  .then(data => { relicsData = data; })
  .catch(() => { relicsData = []; });

// Handle image input and preview
document.getElementById('imageInput').addEventListener('change', function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = document.getElementById('imagePreview');
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById('scanButton').style.display = 'inline-block';
    document.getElementById('ocrResult').textContent = '';
  };
  reader.readAsDataURL(file);
});

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
    // Improved regex: extract only the main relic code (e.g., 'Neo A10')
    const relicRegex = /(Meso|Lith|Neo|Axi)\s?[A-Z][0-9]+/g;
    const matches = [];
    let match;
    while ((match = relicRegex.exec(ocrText)) !== null) {
      matches.push(match[0].replace(/\s+/, ' ')); // Normalize spacing
    }
    // Group into four sections
    let grouped = [];
    for (let i = 0; i < 4; i++) {
      grouped.push(matches.slice(i * 1, (i + 1) * 1)); // 1 relic per group for now
    }
    // Display grouped relics
    ocrResult.innerHTML = grouped.map((group, idx) =>
      `<div><strong>Relic ${idx + 1}:</strong> ${group.join(', ') || 'Not found'}</div>`
    ).join('');

    // For each found relic, find its drops and display part names and prices
    priceResult.innerHTML = 'Loading prices...';
    const priceSections = await Promise.all(grouped.map(async (group, idx) => {
      const relicCode = group[0];
      if (!relicCode) return `<div><strong>Relic ${idx + 1}:</strong> No relic found</div>`;
      // Find matching relic in relicsData (ignore suffixes like 'Radiant', 'Exceptional', etc.)
      const relicEntry = relicsData.find(r => r.name && r.name.startsWith(relicCode));
      if (!relicEntry) return `<div><strong>${relicCode}:</strong> Not found in data</div>`;
      // For each part, fetch price
      const partRows = await Promise.all(relicEntry.rewards.map(async r => {
        const partName = r.item.name;
        const urlName = r.warframeMarket && r.warframeMarket.urlName;
        if (!urlName) return `<div>${partName}: <span style='color:#aaa'>No market data</span></div>`;
        try {
          const res = await fetch(`https://api.warframe.market/v1/items/${urlName}/statistics?platform=pc`);
          const data = await res.json();
          // Use 48hours statistics, closed orders
          const stats = data.payload.statistics_closed['48hours'];
          // Calculate average price
          const avg = stats && stats.length ? (stats.reduce((sum, s) => sum + (s.avg_price || 0), 0) / stats.length).toFixed(1) : 'N/A';
          return `<div>${partName}: <strong>${avg}p</strong></div>`;
        } catch {
          return `<div>${partName}: <span style='color:#aaa'>API error</span></div>`;
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