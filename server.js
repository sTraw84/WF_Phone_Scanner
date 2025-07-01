const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;

// Cache results for 5 minutes
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

app.use(cors());

// Rate limiting to protect your server and the Warframe.Market API
const limiter = rateLimit({
  windowMs: 5000, // 5 seconds
  max: 10,        // Max 10 requests per window per IP
  message: { error: 'Too many requests, slow down.' }
});
app.use('/api/', limiter);

// Warframe Market requires a valid User-Agent
const USER_AGENT = 'WarframeRelicScanner/1.0 (contact: sjtrawick@gmail.com)';

// Single-item proxy (same as before, kept for compatibility)
app.get('/api/orders/:item', async (req, res) => {
  const item = req.params.item.toLowerCase();

  // Check cache
  const cached = cache.get(item);
  if (cached) {
    return res.json(cached);
  }

  const apiUrl = `https://api.warframe.market/v1/items/${item}/orders?platform=pc`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch: ${response.statusText}` });
    }

    const json = await response.json();
    cache.set(item, json);
    res.json(json);
  } catch (e) {
    console.error(`Fetch error for ${item}:`, e);
    res.status(500).json({ error: 'Server error. Please try again later.' });
  }
});

// 🔥 NEW: Batch fetch endpoint
app.get('/api/orders_batch', async (req, res) => {
  const itemsParam = req.query.items;
  if (!itemsParam) {
    return res.status(400).json({ error: 'Missing items query parameter' });
  }

  const items = itemsParam.split(',').map(i => i.trim().toLowerCase());
  const results = {};
  const uncached = [];

  // Check cache first
  items.forEach(item => {
    const cached = cache.get(item);
    if (cached) {
      results[item] = cached;
    } else {
      uncached.push(item);
    }
  });

  // Fetch uncached items in parallel
  try {
    const fetchPromises = uncached.map(async item => {
      const apiUrl = `https://api.warframe.market/v1/items/${item}/orders?platform=pc`;
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`Failed to fetch ${item}: ${response.statusText}`);
        results[item] = { error: `Failed to fetch: ${response.statusText}` };
        return;
      }

      const json = await response.json();
      results[item] = json;
      cache.set(item, json);
    });

    await Promise.all(fetchPromises);

    res.json({ success: true, payload: results });
  } catch (e) {
    console.error('Batch fetch error:', e);
    res.status(500).json({ error: 'Server error during batch fetch' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Proxy server running on port ${PORT}`);
});
