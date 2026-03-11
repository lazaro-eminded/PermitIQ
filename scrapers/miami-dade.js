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
    // Paso 1: cargar el menu para extraer el form y los radio buttons
    const menuUrl = 'https://www.miamidade.gov/Apps/RER/ePermittingMenu/Home/Permits';
    await page.goto(menuUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Extraer toda la info del form
    const formInfo = await page.evaluate(() => {
      const form = document.querySelector('form');
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const textInput = document.querySelector('input[type="text"]');
      return {
        action: form?.action || '',
        method: form?.method || '',
        radios: radios.map(r => ({
          name: r.name,
          value: r.value,
          rowText: r.closest('tr')?.innerText?.replace(/\s+/g, ' ').trim() || ''
        })),
        textInputName: textInput?.name || '',
      };
    });

    // Encontrar el radio de busqueda por direccion
    const addressRadio = formInfo.radios.find(r =>
      /address/i.test(r.rowText) && /cross.reference/i.test(r.rowText)
    ) || formInfo.radios[formInfo.radios.length - 2];

    const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

    // Paso 2: navegar directamente a la URL de busqueda con los parametros correctos
    const searchUrl = new URL(formInfo.action || 'https://www.miamidade.gov/Apps/RER/ePermittingMenu/Process/Permits');
    searchUrl.searchParams.set(formInfo.textInputName || 'Value', cleanAddress);
    if (addressRadio) searchUrl.searchParams.set(addressRadio.name || 'Inquiry', addressRadio.value);

    await page.goto(searchUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const pageSnippet = await page.evaluate(() => document.body.innerText.slice(0, 800));

    // Extraer filas
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('tr'))
        .map(tr => tr.innerText.replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 3)
    );

    // Extraer links — cada link es un numero de permiso individual
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a'))
        .map(a => ({ text: a.innerText.trim(), href: a.href }))
        .filter(a => /\d/.test(a.text) && a.href.includes('RER'))
    );

    // Navegar a cada permiso individual para buscar permisos de techo
    const roofPermits = [];
    let latestYear = null;

    for (const link of links.slice(0, 15)) {
      try {
        await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        const permitText = await page.evaluate(() => document.body.innerText);
        if (/roof|roofing/i.test(permitText)) {
          const years = permitText.match(/\b(19|20)\d{2}\b/g) || [];
          for (const y of years) {
            const yr = parseInt(y);
            if (yr >= 1990 && yr <= new Date().getFullYear()) {
              if (!latestYear || yr > latestYear) latestYear = yr;
            }
          }
          roofPermits.push({ text: link.text, href: link.href, snippet: permitText.slice(0, 200) });
        }
      } catch(e) { /* continuar */ }
    }

    const scoring = calcScore(latestYear);

    return {
      county: 'miami-dade',
      roofAge: scoring.age,
      score: scoring.score,
      label: scoring.label,
      color: scoring.color,
      latestRoofYear: latestYear,
      permits: roofPermits.map(p => ({ raw: p.text, type: 'ROOFING', date: String(latestYear || '') })),
      allPermits: rows,
      debug: {
        formInfo,
        addressRadio,
        searchUrl: searchUrl.toString(),
        currentUrl,
        totalRows: rows.length,
        links: links.slice(0, 10),
        roofPermits: roofPermits.length,
        pageSnippet,
      }
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
