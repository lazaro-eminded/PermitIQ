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

    // Usar JavaScript para seleccionar el radio de busqueda por direccion
    // Es el radio button que corresponde a "Process/Permit Number Cross-Reference (Address)"
    await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      // Seleccionar el ultimo radio que corresponde a busqueda por direccion
      const addressRadio = radios.find((r, i) => {
        const row = r.closest('tr')?.innerText || r.parentElement?.innerText || '';
        return /address/i.test(row);
      }) || radios[radios.length - 2]; // fallback: penultimo radio es address search
      if (addressRadio) {
        addressRadio.checked = true;
        addressRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Limpiar direccion: solo numero y calle sin ciudad/estado/zip
    const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

    // Llenar el campo de texto
    await page.evaluate((addr) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      if (inputs.length > 0) {
        inputs[inputs.length - 1].value = addr;
        inputs[inputs.length - 1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, cleanAddress);

    // Hacer submit con JavaScript
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.submit();
    });

    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);

    // Extraer contenido de la pagina
    const rows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('tr'))
        .map(tr => tr.innerText.replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 5);
    });

    // Si hay links de permisos individuales, navegar al primero para ver historial
    const permitLinks = await page.$$('a[href*="Permit"]');
    const allPermitData = [];

    if (permitLinks.length > 0) {
      // Tomar los primeros 10 links de permisos
      const hrefs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
          .map(a => ({ text: a.innerText.trim(), href: a.href }))
          .filter(a => a.href.includes('RER') || /\d{2}-[A-Z]{2}/.test(a.text))
          .slice(0, 10);
      });
      allPermitData.push(...hrefs.map(h => h.text));
    }

    // Buscar permisos de techo
    const roofRows = rows.filter(r => /roof|roofing|re.roof/i.test(r));
    const allRows = [...rows, ...allPermitData];

    let latestYear = null;
    const searchRows = roofRows.length > 0 ? roofRows : allRows;

    for (const row of searchRows) {
      const years = row.match(/\b(19|20)\d{2}\b/g) || [];
      for (const y of years) {
        const yr = parseInt(y);
        if (yr >= 1980 && yr <= new Date().getFullYear()) {
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
      allPermits: rows.slice(0, 20),
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
