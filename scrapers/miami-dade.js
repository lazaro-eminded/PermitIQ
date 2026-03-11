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
    await page.waitForTimeout(3000);

    // Forzar habilitacion del boton + setear valores + submit via JS puro
    const submitted = await page.evaluate((addr) => {
      try {
        // Setear radio
        const radio = document.querySelector('input[name="permit"][value="addr"]');
        if (!radio) return { ok: false, error: 'radio not found' };
        radio.checked = true;

        // Setear input
        const input = document.querySelector('input[name="inKey"]');
        if (!input) return { ok: false, error: 'input not found' };
        input.value = addr;
        input.removeAttribute('disabled');
        input.removeAttribute('readonly');

        // Forzar habilitar el boton submit
        const btn = document.querySelector('input[type="submit"]');
        if (btn) {
          btn.disabled = false;
          btn.removeAttribute('disabled');
        }

        // Submittear el form directamente
        const form = document.querySelector('form');
        if (!form) return { ok: false, error: 'form not found' };

        // Agregar hidden input con el valor del radio (por si el form no lo toma)
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'permit';
        hidden.value = 'addr';
        form.appendChild(hidden);

        form.submit();
        return { ok: true };
      } catch(e) {
        return { ok: false, error: e.message };
      }
    }, cleanAddress);

    // Esperar a que cargue la nueva pagina
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    const pageText = await page.evaluate(() => document.body.innerText);
    const pageSnippet = pageText.replace(/\s+/g, ' ').trim().slice(0, 1500);

    // Extraer filas
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('tr'))
        .map(tr => tr.innerText.replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 3)
    );

    // Extraer todos los links
    const allLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a'))
        .map(a => ({ text: a.innerText.trim(), href: a.href }))
        .filter(a => a.text.length > 1)
    );

    // Filtrar links de permisos individuales
    const permitLinks = allLinks.filter(l =>
      /ePermittingMenu.*Inquiry|ePermittingMenu.*Process/i.test(l.href) &&
      /\d/.test(l.text)
    );

    // Navegar a permisos de techo
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
          roofPermits.push({ text: link.text, snippet: text.slice(0, 300) });
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
        submitted,
        currentUrl,
        totalRows: rows.length,
        totalLinks: allLinks.length,
        permitLinksFound: permitLinks.length,
        permitLinks: permitLinks.slice(0, 10),
        allLinksRaw: allLinks.filter(l => l.href.includes('RER')).slice(0, 10),
        roofPermits: roofPermits.length,
        pageSnippet,
      }
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
