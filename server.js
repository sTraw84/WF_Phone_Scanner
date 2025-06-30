const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/orders/:item', async (req, res) => {
  const item = req.params.item;
  const apiUrl = `https://api.warframe.market/v1/items/${item}/orders?platform=pc`;
  try {
    const result = await fetch(apiUrl);
    const json = await result.json();
    res.json(json);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Proxy server running on port ${PORT}`)); 