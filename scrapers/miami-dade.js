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

    // Setear valores del form
    await page.evaluate((addr) => {
      const radio = document.querySelector('input[name="permit"][value="addr"]');
      const input = document.querySelector('input[name="inKey"]');
      if (radio) radio.checked = true;
      if (input) input.value = addr;
    }, cleanAddress);

    await page.waitForTimeout(500);

    // Click submit y esperar cambio de URL o contenido nuevo
    await page.click('input[type="submit"]');
    
    // Esperar que la URL cambie o que aparezca contenido nuevo
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    const pageText = await page.evaluate(() => document.body.innerText);
    const pageSnippet = pageText.replace(/\s+/g, ' ').trim().slice(0, 1500);

    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('tr'))
        .map(tr => tr.innerText.replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 3)
    );

    const allLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a'))
        .map(a => ({ text: a.innerText.trim(), href: a.href }))
        .filter(a => a.text.length > 1)
    );

    // Si seguimos en la misma pagina, el submit no funcionó — intentar con keyboard
    if (currentUrl.includes('/Permits')) {
      // Intentar con Enter en el campo
      await page.focus('input[name="inKey"]');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);
    }

    const currentUrl2 = page.url();
    const pageText2 = await page.evaluate(() => document.body.innerText);
    const pageSnippet2 = pageText2.replace(/\s+/g, ' ').trim().slice(0, 1500);

    const rows2 = await page.evaluate(() =>
      Array.from(document.querySelectorAll('tr'))
        .map(tr => tr.innerText.replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 3)
    );

    const allLinks2 = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a'))
        .map(a => ({ text: a.innerText.trim(), href: a.href }))
        .filter(a => a.text.length > 1)
    );

    const scoring = calcScore(null);

    return {
      county: 'miami-dade',
      roofAge: scoring.age,
      score: scoring.score,
      label: scoring.label,
      color: scoring.color,
      latestRoofYear: null,
      permits: [],
      allPermits: rows2,
      debug: {
        afterClick: { url: currentUrl, rows: rows.length, links: allLinks.length, snippet: pageSnippet },
        afterEnter: { url: currentUrl2, rows: rows2.length, links: allLinks2.length, snippet: pageSnippet2 },
        allLinks2: allLinks2.slice(0, 15),
      }
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
