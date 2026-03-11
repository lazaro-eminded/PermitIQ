const axios = require('axios');
const config = require('../config');

const SOCRATA_URL = 'https://opendata.miamidade.gov/resource/ajuk-cyx7.json';

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

  // Construir URL manualmente para evitar problemas de encoding
  const url = `${SOCRATA_URL}?$where=address like '${encodeURIComponent(cleanAddress + '%')}'&$limit=5&$order=issudate DESC`;

  // También probar con query directo sin $where
  const url2 = `${SOCRATA_URL}?address=${encodeURIComponent(cleanAddress)}&$limit=5`;

  const [r1, r2] = await Promise.all([
    axios.get(url, { headers: { 'Accept': 'application/json' }, timeout: 20000 }).catch(e => ({ data: { error: e.message } })),
    axios.get(url2, { headers: { 'Accept': 'application/json' }, timeout: 20000 }).catch(e => ({ data: { error: e.message } })),
  ]);

  const d1 = r1.data;
  const d2 = r2.data;

  return {
    county: 'miami-dade',
    roofAge: null, score: 'NO_DATA', label: 'SIN DATA', color: 'purple',
    latestRoofYear: null, permits: [], allPermits: [],
    debug: {
      url1_type: typeof d1,
      url1_isArray: Array.isArray(d1),
      url1_length: Array.isArray(d1) ? d1.length : null,
      url1_first: Array.isArray(d1) ? d1[0] : d1,
      url2_type: typeof d2,
      url2_isArray: Array.isArray(d2),
      url2_length: Array.isArray(d2) ? d2.length : null,
      url2_first: Array.isArray(d2) ? d2[0] : d2,
    }
  };
}

module.exports = { scrapeMiamiDade };
