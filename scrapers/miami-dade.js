const axios = require('axios');
const config = require('../config');

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= config.ROOF_SCORE.CRITICAL_YEARS) return { score: 'CRITICAL', label: 'CRITICO — Hot Lead', color: 'red', age };
  if (age >= config.ROOF_SCORE.WARM_YEARS)     return { score: 'WARM',     label: 'ATENCION — Warm',   color: 'yellow', age };
  return { score: 'OK', label: 'OK — Cold', color: 'green', age };
}

const ENDPOINTS = [
  'https://gisweb.miamidade.gov/arcgis/rest/services/RER/BuildingPermit/MapServer/0/query',
  'https://gisweb.miamidade.gov/arcgis/rest/services/RER/MD_BuildingPermit/MapServer/0/query',
  'https://gisweb.miamidade.gov/arcgis/rest/services/LandManagement/BuildingPermit/MapServer/0/query',
  'https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/BuildingPermit/FeatureServer/0/query',
];

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();
  const addressLike = cleanAddress.split(' ').slice(0, 3).join(' ');

  const results = [];

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await axios.get(endpoint, {
        params: { where: `SITE_ADDRESS LIKE '${addressLike}%'`, outFields: '*', f: 'json' },
        timeout: 15000
      });
      results.push({
        endpoint,
        status: res.status,
        dataKeys: Object.keys(res.data || {}),
        snippet: JSON.stringify(res.data).slice(0, 300),
      });
    } catch(e) {
      results.push({ endpoint, error: e.message.slice(0, 100) });
    }
  }

  return {
    county: 'miami-dade',
    roofAge: null, score: 'NO_DATA', label: 'SIN DATA', color: 'purple',
    latestRoofYear: null, permits: [], allPermits: [],
    debug: { addressLike, results }
  };
}

module.exports = { scrapeMiamiDade };
