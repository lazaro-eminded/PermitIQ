const axios = require('axios');

const LAYER_URL = 'https://services1.arcgis.com/CvuPhqcTQpZPT9qY/arcgis/rest/services/Building_Permits_Since_2014/FeatureServer/0/query';

const ROOF_SCOPE = new Set(['ROOF','ROOFING','ROOF REPAIR','ROOF REPLACEMENT','TILE ROOF','SHINGLE ROOF','FLAT ROOF','METAL ROOF','REROOF']);
const ROOF_KW  = ['ROOF','SHINGLE','TILE','FLAT ROOF','SBS','SINGLE PLY','GRAVEL','ASPHALT','METAL ROOF','WOOD SHAKE','REROOF'];
const ELEC_KW  = ['ELECTRICAL','ELECTRIC','SOLAR','PANEL','SERVICE CHANGE','LOW VOLTAGE','GENERATOR'];
const AC_KW    = ['A/C','AIR COND','HVAC','MECHANICAL','HEAT PUMP','MINI SPLIT','REFRIGERATION','COOLING'];

function permitCategory(scope, workItems) {
  const s = (scope     || '').toUpperCase();
  const w = (workItems || '').toUpperCase();
  if (ROOF_SCOPE.has(s) || ROOF_KW.some(k => s.includes(k) || w.includes(k))) return 'ROOF';
  if (ELEC_KW.some(k => s.includes(k) || w.includes(k))) return 'ELECTRIC';
  if (AC_KW.some(k => s.includes(k) || w.includes(k)))   return 'AC';
  return 'OTHER';
}

async function scrapePermits(folio, address) {
  let rawPermits = [];

  // FolioNumber es Double — quitar ceros a la izquierda y buscar numerico
  if (folio) {
    try {
      const folioNum = parseInt(folio, 10);
      const res = await axios.get(LAYER_URL, {
        params: {
          where: 'FolioNumber = ' + folioNum,
          outFields: 'FolioNumber,DeliveryAddress,PermitNumber,IssuedDate,ScopeofWork,WorkItems,CompanyName,BuildingPermitStatusDescription,IsPermitFinal',
          resultRecordCount: 200,
          orderByFields: 'IssuedDate DESC',
          f: 'json',
        },
        timeout: 25000,
      });
      rawPermits = res.data?.features?.map(f => f.attributes) || [];
      if (res.data?.error) { console.warn('[city-of-miami] API error:', JSON.stringify(res.data.error)); rawPermits = []; }
      console.log('[city-of-miami] results by FolioNumber:', rawPermits.length);
    } catch (e) { console.warn('[city-of-miami] FOLIO fallo:', e.message); }
  }

  // Fallback por direccion
  if (rawPermits.length === 0 && address) {
    try {
      const res = await axios.get(LAYER_URL, {
        params: {
          where: "DeliveryAddress LIKE '" + address + "%'",
          outFields: 'FolioNumber,DeliveryAddress,PermitNumber,IssuedDate,ScopeofWork,WorkItems,CompanyName,BuildingPermitStatusDescription,IsPermitFinal',
          resultRecordCount: 100,
          orderByFields: 'IssuedDate DESC',
          f: 'json',
        },
        timeout: 25000,
      });
      rawPermits = res.data?.features?.map(f => f.attributes) || [];
      console.log('[city-of-miami] results by DeliveryAddress:', rawPermits.length);
    } catch (e) { console.warn('[city-of-miami] ADDRESS fallo:', e.message); }
  }

  return rawPermits.map(p => {
    const dt = p.IssuedDate ? new Date(p.IssuedDate) : null;
    const scope = (p.ScopeofWork || '').trim();
    const work  = (p.WorkItems   || '').trim();
    return {
      date:        dt ? dt.toLocaleDateString('en-US') : 'N/A',
      year:        dt ? dt.getFullYear() : null,
      month:       dt ? String(dt.getMonth() + 1).padStart(2, '0') : null,
      type:        scope,
      cat:         '',
      description: work || scope,
      status:      (p.BuildingPermitStatusDescription || '').trim(),
      contractor:  (p.CompanyName || '').trim(),
      permitNo:    (p.PermitNumber || '').trim(),
      category:    permitCategory(scope, work),
      source:      'city-of-miami',
    };
  });
}

module.exports = { scrapePermits };
