const axios = require('axios');

const PERMIT_URL = 'https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/Building_Permits_since_2014/FeatureServer/0/query';

const ROOF_TYPES = new Set(['ROOF','ROOFING','ROOF REPAIR','ROOF REPLACEMENT','TILE ROOF','SHINGLE ROOF','FLAT ROOF','METAL ROOF']);
const ROOF_KW = ['ROOF','SHINGLE','TILE','FLAT','SBS','SINGLE PLY','GRAVEL','ASPHALT','METAL ROOF','WOOD SHAKE'];
const ELEC_KW = ['ELECTRICAL','ELECTRIC','SOLAR','PANEL','SERVICE CHANGE','LOW VOLTAGE'];
const AC_KW   = ['A/C','AIR COND','HVAC','MECHANICAL','HEAT PUMP','MINI SPLIT','REFRIGERATION'];

function permitCategory(type, desc) {
  const d = (desc || '').toUpperCase();
  const t = (type || '').toUpperCase();
  if (ROOF_TYPES.has(t) || ROOF_KW.some(k => d.includes(k) || t.includes(k))) return 'ROOF';
  if (ELEC_KW.some(k => d.includes(k) || t.includes(k))) return 'ELECTRIC';
  if (AC_KW.some(k => d.includes(k) || t.includes(k)))   return 'AC';
  return 'OTHER';
}

async function scrapePermits(folio, address) {
  console.log('[city-of-miami] URL:', PERMIT_URL);
  console.log('[city-of-miami] folio:', folio, 'address:', address);

  let rawPermits = [];

  if (folio) {
    try {
      const where = "FOLIO = '" + folio + "'";
      console.log('[city-of-miami] where clause:', where);
      const res = await axios.get(PERMIT_URL, {
        params: { where: where, outFields: 'FOLIO,ADDRESS,PERMIT_NUMBER,ISSUED_DATE,PERMIT_TYPE,WORK_DESCRIPTION,CONTRACTOR_NAME,STATUS', resultRecordCount: 200, orderByFields: 'ISSUED_DATE DESC', f: 'json' },
        timeout: 25000,
      });
      rawPermits = res.data?.features?.map(f => f.attributes) || [];
      if (res.data?.error) { console.warn('[city-of-miami] API error:', JSON.stringify(res.data.error)); rawPermits = []; }
      console.log('[city-of-miami] results by FOLIO:', rawPermits.length);
    } catch (e) { console.warn('[city-of-miami] FOLIO fallo:', e.message); }
  }

  if (rawPermits.length === 0 && address) {
    try {
      const where2 = "ADDRESS LIKE '" + address + "%'";
      const res = await axios.get(PERMIT_URL, {
        params: { where: where2, outFields: 'FOLIO,ADDRESS,PERMIT_NUMBER,ISSUED_DATE,PERMIT_TYPE,WORK_DESCRIPTION,CONTRACTOR_NAME,STATUS', resultRecordCount: 100, orderByFields: 'ISSUED_DATE DESC', f: 'json' },
        timeout: 25000,
      });
      rawPermits = res.data?.features?.map(f => f.attributes) || [];
      console.log('[city-of-miami] results by ADDRESS:', rawPermits.length);
    } catch (e) { console.warn('[city-of-miami] ADDRESS fallo:', e.message); }
  }

  return rawPermits.map(p => {
    let dt = p.ISSUED_DATE ? new Date(p.ISSUED_DATE) : null;
    if (dt && isNaN(dt)) dt = null;
    const type = (p.PERMIT_TYPE || '').trim();
    const desc = (p.WORK_DESCRIPTION || '').trim();
    return {
      date:        dt ? dt.toLocaleDateString('en-US') : 'N/A',
      year:        dt ? dt.getFullYear() : null,
      month:       dt ? String(dt.getMonth() + 1).padStart(2, '0') : null,
      type, cat: '', description: desc,
      status:      (p.STATUS || '').trim(),
      contractor:  (p.CONTRACTOR_NAME || '').trim(),
      permitNo:    (p.PERMIT_NUMBER || '').trim(),
      category:    permitCategory(type, desc),
      source:      'city-of-miami',
    };
  });
}

module.exports = { scrapePermits };
