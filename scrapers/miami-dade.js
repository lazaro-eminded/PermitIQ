const axios = require('axios');
const config = require('../config');

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= config.ROOF_SCORE.CRITICAL_YEARS) return { score: 'CRITICAL', label: 'CRITICO — Hot Lead', color: 'red', age };
  if (age >= config.ROOF_SCORE.WARM_YEARS)     return { score: 'WARM',     label: 'ATENCION — Warm',   color: 'yellow', age };
  return { score: 'OK', label: 'OK — Cold', color: 'green', age };
}

const PERMIT_LAYER = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1/query';

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();
  const parts = cleanAddress.match(/^(\d+)\s+(.+)$/);
  const streetNum = parts ? parts[1] : '';
  const streetName = parts ? parts[2] : cleanAddress;

  // Primero: ver qué campos tiene este layer
  const layerInfo = await axios.get(
    'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1',
    { params: { f: 'json' }, timeout: 10000 }
  );
  const fields = layerInfo.data.fields?.map(f => f.name) || [];

  // Buscar por dirección — probar diferentes campos
  const queries = [
    `SITE_ADDRESS LIKE '${cleanAddress}%'`,
    `ADDRESS LIKE '${cleanAddress}%'`,
    `STNO = '${streetNum}' AND STNAME LIKE '${streetName}%'`,
    `STNO = ${streetNum} AND STNAME LIKE '${streetName}%'`,
    `UPPER(SITE_ADDRESS) LIKE '${cleanAddress}%'`,
  ];

  const results = [];
  for (const where of queries) {
    try {
      const res = await axios.get(PERMIT_LAYER, {
        params: { where, outFields: '*', resultRecordCount: 50, f: 'json' },
        timeout: 15000
      });
      results.push({
        where,
        count: res.data.features?.length ?? 0,
        error: res.data.error?.message,
        sample: res.data.features?.[0]?.attributes || null,
      });
      if (res.data.features?.length > 0) break;
    } catch(e) {
      results.push({ where, error: e.message.slice(0, 80) });
    }
  }

  return {
    county: 'miami-dade',
    roofAge: null, score: 'NO_DATA', label: 'SIN DATA', color: 'purple',
    latestRoofYear: null, permits: [], allPermits: [],
    debug: { cleanAddress, fields, results }
  };
}

module.exports = { scrapeMiamiDade };
