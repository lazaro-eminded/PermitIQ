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
  const baseUrl = 'https://www.miamidade.gov/Apps/RER/ePermittingMenu/Home/Permits';
  const postUrl = 'https://www.miamidade.gov/Apps/RER/ePermittingMenu/Home/Process';

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };

  // Paso 1: GET para obtener cookies y ViewState
  const getResp = await axios.get(baseUrl, { headers, withCredentials: true });
  const cookies = getResp.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';
  const $ = cheerio.load(getResp.data);

  // Extraer ViewState y otros campos ocultos de ASP.NET
  const viewState = $('input[name="__VIEWSTATE"]').val() || '';
  const viewStateGen = $('input[name="__VIEWSTATEGENERATOR"]').val() || '';
  const eventValidation = $('input[name="__EVENTVALIDATION"]').val() || '';

  // Extraer todos los radio buttons para debug
  const radios = [];
  $('input[type="radio"]').each((i, el) => {
    radios.push({ name: $(el).attr('name'), value: $(el).attr('value') });
  });

  // Paso 2: POST con ViewState + campos del form
  const formData = new URLSearchParams();
  if (viewState) formData.append('__VIEWSTATE', viewState);
  if (viewStateGen) formData.append('__VIEWSTATEGENERATOR', viewStateGen);
  if (eventValidation) formData.append('__EVENTVALIDATION', eventValidation);
  formData.append('permit', 'addr');
  formData.append('inKey', cleanAddress);
  formData.append('Submit1', 'Submit');

  const postResp = await axios.post(postUrl, formData.toString(), {
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': baseUrl,
      'Cookie': cookies,
    },
    maxRedirects: 5,
    timeout: 30000,
  });

  const $2 = cheerio.load(postResp.data);
  const pageText = $2('body').text().replace(/\s+/g, ' ').trim();
  const pageSnippet = pageText.slice(0, 1000);

  // Extraer filas de tabla
  const rows = [];
  $2('tr').each((i, tr) => {
    const text = $2(tr).text().replace(/\s+/g, ' ').trim();
    if (text.length > 3) rows.push(text);
  });

  // Extraer links
  const links = [];
  $2('a').each((i, a) => {
    const text = $2(a).text().trim();
    const href = $2(a).attr('href') || '';
    if (text.length > 2 && href) links.push({ text, href });
  });

  // Filtrar links que parecen permisos
  const permitLinks = links.filter(l =>
    /\d{2}-[A-Z]{2}|\b\d{6,}\b/.test(l.text) ||
    (/ePermittingMenu/i.test(l.href) && /\d/.test(l.href))
  );

  // Navegar a permisos individuales con axios para buscar roofing
  let latestYear = null;
  const roofPermits = [];

  for (const link of permitLinks.slice(0, 20)) {
    try {
      const href = link.href.startsWith('http')
        ? link.href
        : `https://www.miamidade.gov${link.href}`;
      const r = await axios.get(href, { headers: { ...headers, Cookie: cookies }, timeout: 10000 });
      const text = cheerio.load(r.data)('body').text();
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
      viewStateFound: viewState.length > 0,
      eventValidationFound: eventValidation.length > 0,
      cookiesFound: cookies.length > 0,
      radios,
      postStatus: postResp.status,
      totalRows: rows.length,
      totalLinks: links.length,
      permitLinksFound: permitLinks.length,
      permitLinks: permitLinks.slice(0, 10),
      roofPermits: roofPermits.length,
      pageSnippet,
    }
  };
}

module.exports = { scrapeMiamiDade };
