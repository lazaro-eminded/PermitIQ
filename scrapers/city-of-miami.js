const axios = require('axios');

const ITEM_ID = '1d6fc60b087c4bcaa22345f429a2ec5a';
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

let _permitUrl = null;

async function resolveUrl() {
  if (_permitUrl) return _permitUrl;
  try {
    const itemRes = await axios.get('https://www.arcgis.com/sharing/rest/content/items/' + ITEM_ID, {
      params: { f: 'json' }, timeout: 10000,
    });
    const serviceUrl = itemRes.data?.url;
    console.log('[city-of-miami] item url:', serviceUrl);
    if (serviceUrl) {
      _permitUrl = serviceUrl.replace(/\/$/, '') + '/0/query';
      console.log('[city-of-miami] permit url resuelto:', _permitUrl);
      return _permitUrl;
    }
  } catch(e) {
    console.warn('[city-of-miami] resolveUrl error:', e.message);
  }
  return null;
}

async function scrapePermits(folio, address) {
  const PERMIT_URL = await resolveUrl();
  if (!PERMIT_URL) {
    console.warn('[city-of-miami] no se pudo resolver URL, retornando []');
    return [];
  }

  let rawPermits = [];

  if (folio) {
    try {
      const res = await axios.get(PERMIT_URL, {
        params: { where: "FOLIO = '" + folio + "'", outFields: 'FOLIO,ADDRESS,PERMIT_NUMBER,ISSUED_DATE,PERMIT_TYPE,WORK_DESCRIPTION,CONTRACTOR_NAME,STATUS', resultRecordCount: 200, orderByFields: 'ISSUED_DATE DESC', f: 'json' },
        timeout: 25000,
      });
      rawPermits = res.data?.features?.map(f => f.attributes) || [];
      if (res.data?.error) { console.warn('[city-of-miami] API error:', JSON.stringify(res.data.error)); rawPermits = []; }
      console.log('[city-of-miami] results by FOLIO:', rawPermits.length, '| sample fields:', rawPermits[0] ? Object.keys(rawPermits[0]).join(',') : 'none');
    } catch (e) { console.warn('[city-of-miami] FOLIO fallo:', e.message); }
  }

  if (rawPermits.length === 0 && address) {
    try {
      const res = await axios.get(PERMIT_URL, {
        params: { where: "ADDRESS LIKE '" + address + "%'", outFields: 'FOLIO,ADDRESS,PERMIT_NUMBER,ISSUED_DATE,PERMIT_TYPE,WORK_DESCRIPTION,CONTRACTOR_NAME,STATUS', resultRecordCount: 10, f: 'json' },
        timeout: 25000,
      });
      rawPermits = res.data?.features?.map(f => f.attributes) || [];
      console.log('[city-of-miami] results by ADDRESS:', rawPermits.length, '| sample:', JSON.stringify(rawPermits[0] || null));
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
