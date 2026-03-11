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
  const page = await browser.newPage();

  try {
    const menuUrl = 'https://www.miamidade.gov/Apps/RER/ePermittingMenu/Home/Permits';
    await page.goto(menuUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

    // Seleccionar radio "addr" = Process/Permit Number Cross-Reference (Address)
    await page.evaluate(() => {
      const radio = document.querySelector('input[name="permit"][value="addr"]');
      if (radio) radio.checked = true;
    });

    // Llenar el campo inKey con la direccion
    await page.evaluate((addr) => {
      const input = document.querySelector('input[name="inKey"]');
      if (input) input.value = addr;
    }, cleanAddress);

    // Hacer submit del form (POST)
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.evaluate(() => document.querySelector('form').submit())
    ]);

    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const pageSnippet = await page.evaluate(() => document.body.innerText.slice(0, 1000));

    // Extraer filas de la tabla de resultados
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('tr'))
        .map(tr => tr.innerText.replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 3)
    );

    // Extraer links de permisos individuales
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a'))
        .map(a => ({ text: a.innerText.trim(), href: a.href }))
        .filter(a => a.text.length > 2)
    );

    // Navegar a cada permiso para buscar roofing
    const roofPermits = [];
    let latestYear = null;

    for (const link of links.filter(l => l.href.includes('RER')).slice(0, 20)) {
      try {
        await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500);
        const text = await page.evaluate(() => document.body.innerText);
        if (/roof|roofing/i.test(text)) {
          const years = text.match(/\b(19|20)\d{2}\b/g) || [];
          for (const y of years) {
            const yr = parseInt(y);
            if (yr >= 1990 && yr <= new Date().getFullYear()) {
              if (!latestYear || yr > latestYear) latestYear = yr;
            }
          }
          roofPermits.push(link.text);
        }
      } catch(e) {}
    }

    const scoring = calcScore(latestYear);

    return {
      county: 'miami-dade',
      roofAge: scoring.age,
      score: scoring.score,
      label: scoring.label,
      color: scoring.color,
      latestRoofYear: latestYear,
      permits: roofPermits.map(t => ({ raw: t, type: 'ROOFING', date: String(latestYear || '') })),
      allPermits: rows,
      debug: {
        currentUrl,
        totalRows: rows.length,
        totalLinks: links.length,
        rerLinks: links.filter(l => l.href.includes('RER')).length,
        roofPermits: roofPermits.length,
        pageSnippet,
        allLinks: links.slice(0, 15),
      }
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
