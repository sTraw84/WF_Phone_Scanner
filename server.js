const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;

// Cache results for 5 minutes
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

app.set('trust proxy', 1); // Trust first proxy (required for rate limiting on Render)

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

  // Log incoming request
  console.log(`[API] /api/orders/${item} requested at ${new Date().toISOString()}`);

  // Check cache
  const cached = cache.get(item);
  if (cached) {
    console.log(`[API] Cache hit for ${item}`);
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
      const text = await response.text();
      console.error(`[API] Fetch failed for ${item}: ${response.status} ${response.statusText} - Body: ${text}`);
      return res.status(response.status).json({ error: `Failed to fetch: ${response.statusText}` });
    }

    const json = await response.json();
    cache.set(item, json);
    console.log(`[API] Success for ${item}`);
    res.json(json);
  } catch (e) {
    console.error(`[API] Exception for ${item}:`, e);
    res.status(500).json({ error: 'Server error. Please try again later.' });
  }
});

// Helper: Throttle async tasks (one at a time, 250ms apart)
async function throttleTasks(tasks, delayMs = 250) {
  const results = [];
  for (const task of tasks) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await task());
    // Don't delay after the last task
    if (task !== tasks[tasks.length - 1]) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
  return results;
}

// 🔥 NEW: Batch fetch endpoint (with outbound throttling)
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

  try {
    // Prepare throttled fetch tasks
    const fetchTasks = uncached.map(item => async () => {
      const apiUrl = `https://api.warframe.market/v1/items/${item}/orders?platform=pc`;
      try {
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
      } catch (e) {
        console.warn(`Fetch error for ${item}:`, e);
        results[item] = { error: 'Server error during fetch' };
      }
    });

    // Throttle outbound requests (250ms apart)
    await throttleTasks(fetchTasks, 250);

    res.json({ success: true, payload: results });
  } catch (e) {
    console.error('Batch fetch error:', e);
    res.status(500).json({ error: 'Server error during batch fetch' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Proxy server running on port ${PORT}`);
});
