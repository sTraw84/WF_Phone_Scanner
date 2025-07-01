// ✅ app.js
let relicsData = [];
fetch('Relics.json')
  .then(res => res.json())
  .then(data => { relicsData = data; })
  .catch(() => { relicsData = []; });

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
    // (Optional) Add your price lookup logic here if needed
  } catch (err) {
    ocrResult.textContent = 'Error during OCR: ' + err.message;
    priceResult.textContent = '';
  }
});
