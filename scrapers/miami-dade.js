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

    // Cargar la pagina para obtener cookies de sesion
    await page.goto('https://www.miamidade.gov/Apps/RER/ePermittingMenu/Home/Permits', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await page.waitForTimeout(2000);

    // Hacer el POST desde dentro del browser usando fetch (usa las cookies activas)
    const html = await page.evaluate(async (addr) => {
      const body = new URLSearchParams();
      body.append('permit', 'addr');
      body.append('inKey', addr);

      const res = await fetch('https://www.miamidade.gov/Apps/RER/ePermittingMenu/Home/Process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        credentials: 'include',
      });
      return await res.text();
    }, cleanAddress);

    // Cargar el HTML en la pagina para poder usar el DOM
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const currentSnippet = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 1500));

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

    // Links que parecen numeros de permiso
    const permitLinks = allLinks.filter(l =>
      /\d{2}-[A-Z]{2}|\b\d{6,}\b/.test(l.text)
    );

    // Navegar a cada permiso individual
    let latestYear = null;
    const roofPermits = [];

    for (const link of permitLinks.slice(0, 20)) {
      try {
        const href = link.href.startsWith('http') ? link.href
          : `https://www.miamidade.gov${link.href}`;
        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 15000 });
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
        totalRows: rows.length,
        totalLinks: allLinks.length,
        permitLinksFound: permitLinks.length,
        permitLinks: permitLinks.slice(0, 10),
        roofPermits: roofPermits.length,
        pageSnippet: currentSnippet,
      }
    };

  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMiamiDade };
