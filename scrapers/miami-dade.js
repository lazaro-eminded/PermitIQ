const { chromium } = require('playwright');
const axios = require('axios');
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

  // Interceptar todas las llamadas de red para encontrar el API interno
  const apiCalls = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('api') || url.includes('search') || url.includes('permit') || url.includes('arcgis')) {
      apiCalls.push({ method: req.method(), url, postData: req.postData() });
    }
  });
  page.on('response', async res => {
    const url = res.url();
    if ((url.includes('api') || url.includes('permit') || url.includes('arcgis')) && 
        res.headers()['content-type']?.includes('json')) {
      try {
        const body = await res.text();
        apiCalls.push({ type: 'response', url, bodySnippet: body.slice(0, 300) });
      } catch(e) {}
    }
  });

  try {
    const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

    // Cargar el EPS Portal moderno
    await page.goto('https://www.miamidade.gov/Apps/RER/EPSPortal', {
      waitUntil: 'networkidle', timeout: 30000
    });
    await page.waitForTimeout(2000);

    const pageSnippet = await page.evaluate(() => document.body.innerText.slice(0, 500));
    const pageTitle = await page.title();

    // Buscar el campo de busqueda en el portal moderno
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input'))
        .map(i => ({ type: i.type, placeholder: i.placeholder, id: i.id, name: i.name, class: i.className }));
    });

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
        pageTitle,
        pageSnippet,
        inputs: inputs.slice(0, 10),
        apiCallsFound: apiCalls.slice(0, 10),
        cleanAddress,
      }
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
