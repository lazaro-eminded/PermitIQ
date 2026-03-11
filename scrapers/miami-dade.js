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

    // Cargar la pagina del form para obtener cookies de sesion
    await page.goto('https://www.miamidade.gov/Apps/RER/ePermittingMenu/Home/Permits', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await page.waitForTimeout(1000);

    // Verificar que el form existe
    const formExists = await page.$('form');
    if (!formExists) throw new Error('No se encontró el formulario en la página');

    // Setear radio y campo via evaluate
    await page.evaluate((addr) => {
      const radio = document.querySelector('input[name="permit"][value="addr"]');
      const input = document.querySelector('input[name="inKey"]');
      if (radio) {
        radio.checked = true;
        radio.click();
      }
      if (input) {
        input.value = addr;
        input.focus();
      }
    }, cleanAddress);

    await page.waitForTimeout(500);

    // Click en el boton Submit y esperar navegacion
    const [response] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.evaluate(() => {
        const submitBtn = document.querySelector('input[type="submit"]');
        if (submitBtn) submitBtn.click();
        else document.querySelector('form').submit();
      })
    ]);

    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const pageText = await page.evaluate(() => document.body.innerText);
    const pageSnippet = pageText.replace(/\s+/g, ' ').trim().slice(0, 1000);

    // Extraer filas
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('tr'))
        .map(tr => tr.innerText.replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 3)
    );

    // Extraer links que parecen permisos
    const allLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a'))
        .map(a => ({ text: a.innerText.trim(), href: a.href }))
        .filter(a => a.text.length > 1)
    );

    const permitLinks = allLinks.filter(l =>
      /\d{2}-[A-Z]{2}|\b\d{7,}\b/.test(l.text) ||
      (/ePermittingMenu/i.test(l.href) && /\d/.test(l.href))
    );

    // Navegar a cada permiso para buscar roofing
    let latestYear = null;
    const roofPermits = [];

    for (const link of permitLinks.slice(0, 20)) {
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
          roofPermits.push({ text: link.text, snippet: text.slice(0, 200) });
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
      permits: roofPermits.map(p => ({ raw: p.text, type: 'ROOFING', date: String(latestYear || '') })),
      allPermits: rows,
      debug: {
        currentUrl,
        totalRows: rows.length,
        permitLinksFound: permitLinks.length,
        allLinksFound: allLinks.length,
        permitLinks: permitLinks.slice(0, 10),
        roofPermits: roofPermits.length,
        pageSnippet,
        allLinksRaw: allLinks.slice(0, 15),
      }
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
