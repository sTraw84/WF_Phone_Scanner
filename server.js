const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 60 }); // Cache results for 60 seconds

app.use(cors());

// Apply basic rate limiting to avoid being blocked by the Warframe.Market API
const limiter = rateLimit({
  windowMs: 1000, // 1 second window
  max: 3,         // limit each IP to 3 requests per windowMs
  message: { error: 'Too many requests, slow down.' }
});
app.use('/api/', limiter);

// Set User-Agent to comply with Warframe.Market API rules
const USER_AGENT = 'WarframeRelicScanner/1.0 (contact: sjtrawick@gmail.com)';

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
    cache.set(item, json); // Cache the response
    res.json(json);
  } catch (e) {
    console.error(`Fetch error for ${item}:`, e);
    res.status(500).json({ error: 'Server error. Please try again later.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Proxy server running on port ${PORT}`);
});
