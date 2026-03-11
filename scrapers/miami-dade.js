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
    executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH
      ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium-1208/chrome-linux64/chrome`
      : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();

  try {
    const portalUrl = 'https://www.miamidade.gov/Apps/RER/ePermittingMenu/Home/Permits';
    await page.goto(portalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Seleccionar radio button de busqueda por direccion
    // "Process/Permit Number Cross-Reference (Address)"
    const radioButtons = await page.$$('input[type="radio"]');
    for (const rb of radioButtons) {
      const val = await rb.getAttribute('value') || '';
      // El radio de Address es el que tiene valor relacionado con address search
      const parent = await rb.evaluateHandle(el => el.parentElement?.innerText || '');
      const text = await parent.jsonValue();
      if (/address/i.test(text) && /cross.reference/i.test(text)) {
        await rb.click();
        break;
      }
    }

    // Limpiar la direccion: solo calle y numero, sin ciudad/estado/zip
    const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

    // Ingresar la direccion en el campo de texto
    const input = await page.$('input[type="text"], input[name="Value"]');
    if (!input) throw new Error('No se encontró campo de entrada en el portal');
    await input.fill(cleanAddress);

    // Hacer submit
    const submitBtn = await page.$('input[type="submit"], input[value="Submit"]');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }

    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    // Extraer todos los numeros de permiso de los resultados
    const pageText = await page.content();
    const permitNumbers = [...new Set(
      (pageText.match(/\b\d{2}-[A-Z]{2}-\d+|\b[A-Z]{1,2}\d{6,}/g) || [])
    )].slice(0, 20);

    // Extraer filas de la tabla de resultados
    const rows = await page.evaluate(() => {
      const trs = Array.from(document.querySelectorAll('tr'));
      return trs.map(tr => tr.innerText).filter(t => t.trim().length > 5);
    });

    // Buscar permisos de techo en el texto
    const roofRows = rows.filter(r => /roof|roofing|re.roof/i.test(r));

    // Extraer anos de los permisos de techo
    let latestYear = null;
    for (const row of roofRows) {
      const years = row.match(/\b(19|20)\d{2}\b/g) || [];
      for (const y of years) {
        const yr = parseInt(y);
        if (yr >= 1980 && yr <= new Date().getFullYear()) {
          if (!latestYear || yr > latestYear) latestYear = yr;
        }
      }
    }

    // Si no hay datos especificos de techo, buscar en todas las filas
    if (!latestYear && rows.length > 0) {
      for (const row of rows) {
        const years = row.match(/\b(19|20)\d{2}\b/g) || [];
        for (const y of years) {
          const yr = parseInt(y);
          if (yr >= 1980 && yr <= new Date().getFullYear()) {
            if (!latestYear || yr > latestYear) latestYear = yr;
          }
        }
      }
    }

    const scoring = calcScore(latestYear);

    const permits = roofRows.map(r => ({
      raw: r.trim(),
      type: 'ROOFING',
      date: (r.match(/\b(19|20)\d{2}\b/) || [''])[0],
    }));

    return {
      county: 'miami-dade',
      roofAge: scoring.age,
      score: scoring.score,
      label: scoring.label,
      color: scoring.color,
      latestRoofYear: latestYear,
      permits,
      allPermits: rows.slice(0, 30),
      permitNumbers,
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
