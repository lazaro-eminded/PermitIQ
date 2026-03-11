const axios = require('axios');
const config = require('../config');

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= config.ROOF_SCORE.CRITICAL_YEARS) return { score: 'CRITICAL', label: 'CRITICO — Hot Lead', color: 'red', age };
  if (age >= config.ROOF_SCORE.WARM_YEARS)     return { score: 'WARM',     label: 'ATENCION — Warm',   color: 'yellow', age };
  return { score: 'OK', label: 'OK — Cold', color: 'green', age };
}

const BASE = 'https://gisweb.miamidade.gov/arcgis/rest/services';

const ENDPOINTS = [
  `${BASE}/MD_LandInformation/MapServer`,
  `${BASE}/LandManagement/MD_LandInformation/MapServer`,
  `${BASE}/LandManagement/MD_LandMgtViewer/MapServer`,
  `${BASE}/EnerGov/MD_LandMgtViewer/MapServer`,
  `${BASE}/Flipper/MD_Flipper/MapServer`,
];

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

  // Primero: descubrir qué layers existen en cada endpoint
  const discovery = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await axios.get(endpoint, { params: { f: 'json' }, timeout: 10000 });
      const data = res.data;
      if (data.layers) {
        discovery.push({
          endpoint,
          layers: data.layers.map(l => `${l.id}: ${l.name}`),
        });
      } else if (data.error) {
        discovery.push({ endpoint, error: data.error.message });
      } else {
        discovery.push({ endpoint, keys: Object.keys(data) });
      }
    } catch(e) {
      discovery.push({ endpoint, error: e.message.slice(0, 80) });
    }
  }

  return {
    county: 'miami-dade',
    roofAge: null, score: 'NO_DATA', label: 'SIN DATA', color: 'purple',
    latestRoofYear: null, permits: [], allPermits: [],
    debug: { cleanAddress, discovery }
  };
}

module.exports = { scrapeMiamiDade };
