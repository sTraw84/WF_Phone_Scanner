document.getElementById('debug').textContent = "app.js loaded";

const modeSelect = document.getElementById('modeSelect');
const scanSection = document.getElementById('scanSection');

document.getElementById('fissureModeBtn').onclick = () => {
  document.getElementById('debug').textContent = "Fissure Scan button clicked";
  modeSelect.style.display = 'none';
  scanSection.style.display = 'block';
};
document.getElementById('massModeBtn').onclick = () => {
  document.getElementById('debug').textContent = "Mass Scan button clicked";
  modeSelect.style.display = 'none';
  scanSection.style.display = 'block';
};
