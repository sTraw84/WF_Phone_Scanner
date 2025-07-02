# Warframe Relic Scanner

A free, fast, and user-friendly web app for scanning Warframe relics and instantly fetching live market prices for their rewards.  
Supports image OCR, manual entry, and batch price lookups using the Warframe Market API.

---

## Features

- **Scan Relics via Camera or Image Upload:**  
  Use your device's camera or upload a screenshot to scan relic codes using OCR (Tesseract.js).

- **Manual Relic Entry:**  
  Enter relic codes directly if you prefer not to use images.

- **Live Price Lookup:**  
  Instantly fetches and displays the average market price for each relic reward, using real-time data from [warframe.market](https://warframe.market/).

- **Batch Processing:**  
  Efficiently fetches prices for multiple relics at once, minimizing API calls and latency.

- **Caching & Rate Limiting:**  
  Backend caches results for 5 minutes and rate-limits requests to protect both your server and the upstream API.

- **Free Hosting:**  
  Designed to run on free hosting platforms (Render.com, Cloudflare Workers, etc.).

---

## How It Works

1. **Frontend (`index.html`, `app.js`):**
   - Lets users scan relics via camera, upload, or manual entry.
   - Uses Tesseract.js for OCR.
   - Sends relic codes to the backend for price lookup.
   - Displays results in a clean, mobile-friendly UI.

2. **Backend (`server.js`):**
   - Express.js server with endpoints for:
     - `/api/orders/:item` — fetches price data for a single item.
     - `/api/orders_batch?items=item1,item2,...` — fetches price data for multiple items in one request (with outbound throttling).
     - `/api/items` — fetches the list of all items for slug mapping.
   - Caches API responses in memory for 5 minutes.
   - Rate-limits API usage (10 requests per 5 seconds per IP).
   - Serves static frontend files.

3. **Relics Data (`Relics.json`):**
   - Contains the structure and rewards for all relics.
   - Used to map scanned/entered relic codes to their possible rewards.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v14+ recommended)
- [npm](https://www.npmjs.com/)

### Installation

```bash
git clone https://github.com/yourusername/wf-phone-scanner.git
cd wf-phone-scanner
npm install
```

### Running Locally

```bash
node server.js
```

- Visit [http://localhost:3000](http://localhost:3000) in your browser.

### Deployment

- **Render.com:**  
  - Free plan supported (see `render.yaml` for config).
  - Deploy as a web service with `node server.js` as the start command.

- **Cloudflare Workers (Recommended for Scalability):**  
  - Refactor backend logic for Workers and KV caching if you need global scale and 100% free hosting for up to 100,000 requests/day.

---

## File Structure

```
.
├── app.js           # Frontend logic (OCR, UI, API calls)
├── server.js        # Express backend (API proxy, caching, rate limiting)
├── index.html       # Main web UI
├── style.css        # App styles
├── Relics.json      # Relic data (large file, not included in repo)
├── package.json     # Node.js dependencies
├── render.yaml      # Render.com deployment config
└── example.jpg      # Example relic image
```

---

## API Endpoints

- `GET /api/orders/:item`  
  Fetch price data for a single item (slug).

- `GET /api/orders_batch?items=item1,item2,...`  
  Fetch price data for multiple items (recommended for batch lookups).

- `GET /api/items`  
  Fetch all item names and slugs for mapping.

---

## Technologies Used

- **Frontend:**  
  - Vanilla JS, Tesseract.js (OCR), HTML/CSS

- **Backend:**  
  - Node.js, Express, node-fetch, cors, express-rate-limit, node-cache

- **Data/API:**  
  - [warframe.market](https://warframe.market/) (live price data)
  - Local `Relics.json` (relic structure)

---

## Notes

- This project is 100% free and open source.  
- No user data is stored or tracked.
- If you hit free tier limits on Render or Cloudflare, requests may be rate-limited or dropped until the next day.

---

## License

MIT

---

## Credits

- Warframe and all related terms are trademarks of Digital Extremes Ltd.
- Market data provided by [warframe.market](https://warframe.market/).
- OCR powered by [Tesseract.js](https://github.com/naptha/tesseract.js).

---

**Feel free to fork, contribute, or suggest improvements!** 