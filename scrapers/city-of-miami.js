const axios = require('axios');

const LAYER_URL = 'https://services1.arcgis.com/CvuPhqcTQpZPT9qY/arcgis/rest/services/Building_Permits_Since_2014/FeatureServer/0/query';

async function scrapePermits(folio, address) {
  const folioNum = parseInt(folio, 10);
  const streetNum = address.match(/^(\d+)/)?.[1] || '';

  // Test 1: folio exacto
  let t1 = [];
  try {
    const r = await axios.get(LAYER_URL, { params: { where: 'FolioNumber = ' + folioNum, outFields: 'FolioNumber,DeliveryAddress,ScopeofWork', resultRecordCount: 5, f: 'json' }, timeout: 10000 });
    t1 = r.data?.features?.map(f => f.attributes) || [];
    console.log('[debug] t1 folio=' + folioNum + ' count:', t1.length);
  } catch(e) { console.log('[debug] t1 error:', e.message); }

  // Test 2: solo numero de calle en DeliveryAddress
  let t2 = [];
  try {
    const r = await axios.get(LAYER_URL, { params: { where: "DeliveryAddress LIKE '" + streetNum + " %'", outFields: 'FolioNumber,DeliveryAddress,ScopeofWork', resultRecordCount: 5, f: 'json' }, timeout: 10000 });
    t2 = r.data?.features?.map(f => f.attributes) || [];
    console.log('[debug] t2 streetNum=' + streetNum + ' count:', t2.length, 'sample:', JSON.stringify(t2[0] || null));
  } catch(e) { console.log('[debug] t2 error:', e.message); }

  // Test 3: rango de FolioNumber para folio 01-41xx (primer digito 1 seguido de 41)
  let t3 = [];
  try {
    const r = await axios.get(LAYER_URL, { params: { where: 'FolioNumber >= 141000000000 AND FolioNumber <= 142000000000', outFields: 'FolioNumber,DeliveryAddress', resultRecordCount: 5, f: 'json' }, timeout: 10000 });
    t3 = r.data?.features?.map(f => f.attributes) || [];
    console.log('[debug] t3 folio range 141xxx count:', t3.length, 'samples:', JSON.stringify(t3));
  } catch(e) { console.log('[debug] t3 error:', e.message); }

  // Test 4: ver cuantos registros totales tiene el dataset
  try {
    const r = await axios.get(LAYER_URL, { params: { where: '1=1', returnCountOnly: true, f: 'json' }, timeout: 10000 });
    console.log('[debug] total registros dataset:', r.data?.count);
  } catch(e) { console.log('[debug] count error:', e.message); }

  return [];
}

module.exports = { scrapePermits };
