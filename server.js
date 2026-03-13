const express = require('express');
const cors    = require('cors');
const config  = require('./config');
const app     = express();

app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

app.post('/api/search',      require('./routes/search'));
app.get('/api/debug/:type',  require('./routes/debug'));
app.post('/api/webhook/ghl', require('./routes/ghl-webhook'));
app.post('/api/bulk-upload', require('./routes/bulk-upload'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

function startKeepAlive() {
  if (!config.RENDER_URL) return;
  setInterval(async () => {
    try {
      await fetch(`${config.RENDER_URL}/health`);
      console.log('[Keep-Alive] OK -', new Date().toLocaleTimeString());
    } catch (e) {
      console.error('[Keep-Alive] Error:', e.message);
    }
  }, config.KEEPALIVE_INTERVAL);
}

app.listen(config.PORT, () => {
  console.log(`PermitIQ corriendo en puerto ${config.PORT}`);
  startKeepAlive();
});


