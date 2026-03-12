const axios = require('axios');

const LAYER_URL = 'https://services1.arcgis.com/CvuPhqcTQpZPT9qY/arcgis/rest/services/Building_Permits_Since_2014/FeatureServer/0';

async function scrapePermits(folio, address) {
  // PASO 1: ver todos los campos del layer
  let fields = [];
  try {
    const info = await axios.get(LAYER_URL, { params: { f: 'json' }, timeout: 10000 });
    fields = info.data?.fields?.map(f => f.name + '(' + f.type + ')') || [];
    console.log('[city-of-miami] FIELDS:', JSON.stringify(fields));
  } catch(e) { console.warn('[city-of-miami] fields error:', e.message); }

  // PASO 2: traer 3 registros al azar para ver valores reales
  try {
    const sample = await axios.get(LAYER_URL + '/query', {
      params: { where: '1=1', outFields: '*', resultRecordCount: 3, f: 'json' },
      timeout: 10000,
    });
    const rows = sample.data?.features?.map(f => f.attributes) || [];
    console.log('[city-of-miami] SAMPLE ROW 0:', JSON.stringify(rows[0] || null));
    console.log('[city-of-miami] SAMPLE ROW 1:', JSON.stringify(rows[1] || null));
  } catch(e) { console.warn('[city-of-miami] sample error:', e.message); }

  return [];
}

module.exports = { scrapePermits };
