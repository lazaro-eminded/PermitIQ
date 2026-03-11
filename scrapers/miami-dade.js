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

  try {
    const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

    await page.goto('https://www.miamidade.gov/Apps/RER/ePermittingMenu/Home/Permits', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await page.waitForTimeout(2000);

    // Ver estado inicial del boton y radios
    const initialState = await page.evaluate(() => {
      const btn = document.querySelector('input[type="submit"]');
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const addrRadio = document.querySelector('input[name="permit"][value="addr"]');
      return {
        btnDisabled: btn?.disabled,
        btnExists: !!btn,
        totalRadios: radios.length,
        addrRadioExists: !!addrRadio,
        addrRadioDisabled: addrRadio?.disabled,
        pageTitle: document.title,
      };
    });

    // Click real en el radio button usando Playwright (fuerza el evento JS)
    await page.locator('input[name="permit"][value="addr"]').dispatchEvent('click');
    await page.waitForTimeout(1000);

    // Ver estado despues del click
    const afterRadioClick = await page.evaluate(() => {
      const btn = document.querySelector('input[type="submit"]');
      const addrRadio = document.querySelector('input[name="permit"][value="addr"]');
      return {
        btnDisabled: btn?.disabled,
        addrRadioChecked: addrRadio?.checked,
      };
    });

    // Llenar el campo
    await page.locator('input[name="inKey"]').fill(cleanAddress);
    await page.waitForTimeout(500);

    // Ver estado final antes de submit
    const beforeSubmit = await page.evaluate(() => {
      const btn = document.querySelector('input[type="submit"]');
      const input = document.querySelector('input[name="inKey"]');
      return {
        btnDisabled: btn?.disabled,
        inputValue: input?.value,
      };
    });

    const scoring = calcScore(null);

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
        initialState,
        afterRadioClick,
        beforeSubmit,
        cleanAddress,
      }
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
