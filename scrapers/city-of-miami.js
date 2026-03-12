const axios = require('axios');

const PERMIT_URL = 'https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/Building_Permits_since_2014/FeatureServer/0/query';

async function scrapePermits(folio, address) {
  // DEBUG: ver que devuelve el FeatureServer
  const debug = {};

  // Test 1: ver fields disponibles (1 record al azar)
  try {
    const r1 = await axios.get(PERMIT_URL, {
      params: { where: '1=1', outFields: '*', resultRecordCount: 1, f: 'json' },
      timeout: 25000,
    });
    debug.test1_error = r1.data?.error?.message || null;
    debug.test1_fields = r1.data?.fields?.map(f => f.name) || null;
    debug.test1_sample = r1.data?.features?.[0]?.attributes || null;
    debug.test1_count = r1.data?.features?.length ?? 0;
  } catch(e) { debug.test1_exception = e.message; }

  // Test 2: buscar por FOLIO exacto
  try {
    const r2 = await axios.get(PERMIT_URL, {
      params: { where: `FOLIO = '${folio}'`, outFields: '*', resultRecordCount: 10, f: 'json' },
      timeout: 25000,
    });
    debug.test2_error = r2.data?.error?.message || null;
    debug.test2_count = r2.data?.features?.length ?? 0;
  } catch(e) { debug.test2_exception = e.message; }

  // Test 3: buscar por ADDRESS
  try {
    const r3 = await axios.get(PERMIT_URL, {
      params: { where: `ADDRESS LIKE '${address}%'`, outFields: '*', resultRecordCount: 5, f: 'json' },
      timeout: 25000,
    });
    debug.test3_error = r3.data?.error?.message || null;
    debug.test3_count = r3.data?.features?.length ?? 0;
    debug.test3_sample = r3.data?.features?.[0]?.attributes || null;
  } catch(e) { debug.test3_exception = e.message; }

  console.log('[city-of-miami DEBUG]', JSON.stringify(debug, null, 2));
  return [];
}

module.exports = { scrapePermits };
