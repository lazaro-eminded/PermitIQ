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
    const portalUrl = 'https://www.miamidade.gov/Apps/RER/ePermittingMenu/Home/Permits';
    await page.goto(portalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

    // Seleccionar radio de busqueda por direccion via JS
    await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const addressRadio = radios.find(r => {
        const row = r.closest('tr')?.innerText || '';
        return /address/i.test(row);
      }) || radios[radios.length - 2];
      if (addressRadio) {
        addressRadio.checked = true;
        addressRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Llenar campo
    await page.evaluate((addr) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      const last = inputs[inputs.length - 1];
      if (last) {
        last.value = addr;
        last.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, cleanAddress);

    // Submit
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.submit();
    });

    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);

    // Capturar todo el texto visible para debug
    const debugText = await page.evaluate(() => document.body.innerText);
    const currentUrl = page.url();

    // Extraer filas de tablas
    const rows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('tr'))
        .map(tr => tr.innerText.replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 5);
    });

    // Buscar links de permisos individuales (cada uno lleva al historial real)
    const permitLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map(a => ({ text: a.innerText.trim(), href: a.href }))
        .filter(a => a.text.length > 3);
    });

    // Buscar permisos de techo
    const roofRows = rows.filter(r => /roof|roofing|re.roof/i.test(r));

    // Extraer años SOLO de filas de techo
    let latestYear = null;
    for (const row of roofRows) {
      const years = row.match(/\b(19|20)\d{2}\b/g) || [];
      for (const y of years) {
        const yr = parseInt(y);
        if (yr >= 1990 && yr <= new Date().getFullYear()) {
          if (!latestYear || yr > latestYear) latestYear = yr;
        }
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
      permits: roofRows.map(r => ({ raw: r, type: 'ROOFING', date: (r.match(/\b(19|20)\d{2}\b/) || [''])[0] })),
      allPermits: rows.slice(0, 30),
      debug: {
        url: currentUrl,
        totalRows: rows.length,
        roofRows: roofRows.length,
        permitLinks: permitLinks.slice(0, 10),
        pageSnippet: debugText.slice(0, 500),
      }
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
