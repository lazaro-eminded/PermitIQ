const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../config');

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= config.ROOF_SCORE.CRITICAL_YEARS) return { score: 'CRITICAL', label: 'CRITICO — Hot Lead', color: 'red', age };
  if (age >= config.ROOF_SCORE.WARM_YEARS)     return { score: 'WARM',     label: 'ATENCION — Warm',   color: 'yellow', age };
  return { score: 'OK', label: 'OK — Cold', color: 'green', age };
}

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

  // POST directo al portal — mismo request que hace el browser
  const formUrl = 'https://www.miamidade.gov/Apps/RER/ePermittingMenu/Home/Process';
  const params = new URLSearchParams();
  params.append('permit', 'addr');
  params.append('inKey', cleanAddress);

  const response = await axios.post(formUrl, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': 'https://www.miamidade.gov/Apps/RER/ePermittingMenu/Home/Permits',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': 'https://www.miamidade.gov',
    },
    maxRedirects: 5,
    timeout: 30000,
  });

  const $ = cheerio.load(response.data);
  const pageText = $.text();
  const pageSnippet = pageText.replace(/\s+/g, ' ').trim().slice(0, 1000);

  // Extraer todas las filas de la tabla
  const rows = [];
  $('tr').each((i, tr) => {
    const text = $(tr).text().replace(/\s+/g, ' ').trim();
    if (text.length > 3) rows.push(text);
  });

  // Extraer links de permisos
  const links = [];
  $('a').each((i, a) => {
    const text = $(a).text().trim();
    const href = $(a).attr('href') || '';
    if (text.length > 2 && href) {
      const fullHref = href.startsWith('http') ? href : `https://www.miamidade.gov${href}`;
      links.push({ text, href: fullHref });
    }
  });

  // Filtrar links que parecen numeros de permiso
  const permitLinks = links.filter(l =>
    /\d{2}-[A-Z]{2}|\d{6,}|permit/i.test(l.text) ||
    /ePermittingMenu.*Process|permit/i.test(l.href)
  ).filter(l => !/(Home|Plans|Menu|BLDG|Type|Format|About|Privacy|Disclaimer|Webmaster|economy|miamidade\.gov\/$)/i.test(l.text));

  // Navegar con Playwright a cada permiso individual
  let latestYear = null;
  const roofPermits = [];

  if (permitLinks.length > 0) {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    for (const link of permitLinks.slice(0, 15)) {
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
    await browser.close();
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
      postUrl: formUrl,
      responseStatus: response.status,
      finalUrl: response.request?.res?.responseUrl || formUrl,
      totalRows: rows.length,
      totalLinks: links.length,
      permitLinks: permitLinks.slice(0, 10),
      roofPermits: roofPermits.length,
      pageSnippet,
    }
  };
}

module.exports = { scrapeMiamiDade };
