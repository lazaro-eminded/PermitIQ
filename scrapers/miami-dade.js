const { chromium } = require('playwright');
const axios = require('axios');
const config = require('../config');

async function solveCaptcha(sitekey, pageUrl) {
  const res = await axios.post('https://2captcha.com/in.php', null, {
    params: { key: config.CAPTCHA_API_KEY, method: 'userrecaptcha', googlekey: sitekey, pageurl: pageUrl, json: 1 }
  });
  if (res.data.status !== 1) throw new Error('2Captcha error: ' + res.data.request);
  const taskId = res.data.request;

  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const poll = await axios.get('https://2captcha.com/res.php', {
      params: { key: config.CAPTCHA_API_KEY, action: 'get', id: taskId, json: 1 }
    });
    if (poll.data.status === 1) return poll.data.request;
    if (poll.data.request !== 'CAPCHA_NOT_READY') throw new Error('2Captcha failed: ' + poll.data.request);
  }
  throw new Error('2Captcha timeout');
}

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= config.ROOF_SCORE.CRITICAL_YEARS) return { score: 'CRITICAL', label: 'CRITICO — Hot Lead', color: 'red', age };
  if (age >= config.ROOF_SCORE.WARM_YEARS)     return { score: 'WARM',     label: 'ATENCION — Warm',   color: 'yellow', age };
  return { score: 'OK', label: 'OK — Cold', color: 'green', age };
}

async function scrapeMiamiDade(address) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const portalUrl = config.PORTALS['miami-dade'];
    await page.goto(portalUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Resolver CAPTCHA si aparece
    const sitekeyEl = await page.$('[data-sitekey]');
    if (sitekeyEl) {
      const sitekey = await sitekeyEl.getAttribute('data-sitekey');
      const token = await solveCaptcha(sitekey, portalUrl);
      await page.evaluate(t => {
        document.querySelector('#g-recaptcha-response').value = t;
      }, token);
    }

    // Buscar por dirección
    const searchInput = await page.$('input[name="address"], input[placeholder*="address" i], input[type="text"]');
    if (!searchInput) throw new Error('No se encontró el campo de búsqueda');
    await searchInput.fill(address);
    await page.keyboard.press('Enter');
    await page.waitForSelector('table, .results, .permit-list', { timeout: 30000 });

    // Extraer permisos
    const permits = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr, .permit-row'));
      return rows.map(r => ({
        type:   r.querySelector('td:nth-child(2), .type')?.innerText?.trim() || '',
        date:   r.querySelector('td:nth-child(3), .date')?.innerText?.trim() || '',
        status: r.querySelector('td:nth-child(4), .status')?.innerText?.trim() || '',
        desc:   r.querySelector('td:nth-child(5), .desc')?.innerText?.trim() || '',
      })).filter(p => p.type);
    });

    // Filtrar permisos de techo
    const roofPermits = permits.filter(p =>
      /roof|roofing|re-roof/i.test(p.type) || /roof|roofing/i.test(p.desc)
    );

    // Año del permiso más reciente
    let latestYear = null;
    for (const p of roofPermits) {
      const match = p.date.match(/(\d{4})/);
      if (match) {
        const y = parseInt(match[1]);
        if (!latestYear || y > latestYear) latestYear = y;
      }
    }

    const scoring = calcScore(latestYear);

    return {
      county: 'miami-dade',
      roofAge: scoring.age,
      score: scoring.score,
      label: scoring.label,
      color: scoring.color,
      latestRoofYear: latestYear,
      permits: roofPermits,
      allPermits: permits,
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
