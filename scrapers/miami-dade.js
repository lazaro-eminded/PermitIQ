const { chromium } = require('playwright');
const config = require('../config');

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= config.ROOF_SCORE.CRITICAL_YEARS) return { score: 'CRITICAL', label: 'CRITICO — Hot Lead', color: 'red', age };
  if (age >= config.ROOF_SCORE.WARM_YEARS)     return { score: 'WARM',     label: 'ATENCION — Warm',   color: 'yellow', age };
  return { score: 'OK', label: 'OK — Cold', color: 'green', age };
}

async function scrapeMiamiDade(address) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Capturar todas las llamadas de red
  const networkCalls = [];
  page.on('request', req => {
    const url = req.url();
    if (!url.includes('font') && !url.includes('.png') && !url.includes('.css') && !url.includes('.js')) {
      networkCalls.push({ type: 'request', method: req.method(), url: url.slice(0, 200) });
    }
  });
  page.on('response', async res => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json') && !url.includes('font')) {
      try {
        const text = await res.text();
        networkCalls.push({ type: 'response_json', url: url.slice(0, 200), body: text.slice(0, 400) });
      } catch(e) {}
    }
  });

  try {
    const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();
    // Separar numero y nombre de calle
    const parts = cleanAddress.match(/^(\d+)\s+(.+)$/);
    const streetNum = parts ? parts[1] : '';
    const streetName = parts ? parts[2] : cleanAddress;

    // Cargar EPS Portal y buscar el Advanced Search
    await page.goto('https://www.miamidade.gov/Apps/RER/EPSPortal', {
      waitUntil: 'networkidle', timeout: 30000
    });
    await page.waitForTimeout(2000);

    // Buscar boton de Advanced Search
    const advancedBtn = await page.$('a:has-text("Advanced"), button:has-text("Advanced"), [href*="advanced"], [href*="search"]');
    if (advancedBtn) {
      await advancedBtn.click();
      await page.waitForTimeout(2000);
    }

    const pageText1 = await page.evaluate(() => document.body.innerText.slice(0, 500));
    const inputs1 = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input, select'))
        .map(el => ({ tag: el.tagName, type: el.type, id: el.id, name: el.name, placeholder: el.placeholder }))
        .slice(0, 15)
    );
    const links1 = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a'))
        .map(a => ({ text: a.innerText.trim().slice(0, 50), href: a.href.slice(0, 100) }))
        .filter(a => a.text.length > 2)
        .slice(0, 15)
    );

    return {
      county: 'miami-dade',
      roofAge: null,
      score: 'NO_DATA',
      label: 'SIN DATA',
      color: 'purple',
      latestRoofYear: null,
      permits: [],
      allPermits: [],
      debug: {
        cleanAddress,
        streetNum,
        streetName,
        pageText1,
        inputs1,
        links1,
        networkCalls: networkCalls.slice(0, 20),
      }
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
