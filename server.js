// ======= server.js =======
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/api/orders/:item', async (req, res) => {
  const item = req.params.item;
  const apiUrl = `https://api.warframe.market/v1/items/${item}/orders?platform=pc`;

  let attempts = 0;
  const maxAttempts = 3;
  let delay = 1000; // Start with 1 second

  while (attempts < maxAttempts) {
    try {
      const result = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'sjtrawick@gmail.com', // 🔁 Replace with your actual contact email
          'Accept': 'application/json'
        }
      });

      if (!result.ok) {
        const text = await result.text();
        console.error(`Market API error: ${result.status} - ${result.statusText} - ${text}`);

        if (result.status === 429) {
          attempts++;
          await new Promise(r => setTimeout(r, delay));
          delay *= 2; // exponential backoff
          continue;
        }

        return res.status(result.status).json({
          error: `Market API error: ${result.statusText}`,
          status: result.status,
          body: text
        });
      }

      const json = await result.json();
      return res.json(json);

    } catch (e) {
      console.error(`Fetch error: ${e.message}`);

      if (attempts < maxAttempts - 1) {
        attempts++;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }

      return res.status(500).json({ error: e.message });
    }
  }
});

// Optional: log a warning if too many retries were needed
app.listen(PORT, () => console.log(`✅ Proxy server running on port ${PORT}`));
