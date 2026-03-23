/**
 * scrapers/broward.js
 *
 * Property data: Broward County GIS (gis.broward.org) — no token needed
 * Permits:       Fort Lauderdale BuildingPermitTracker (FTL only)
 */

// Broward County open GIS parcel layer — field names to try in order
const BROWARD_GIS = 'https://gis.broward.org/arcgis/rest/services/RegionalGIS/BCParcelData/MapServer/0/query';

// Fort Lauderdale permits
const FTL_BASE = 'https://gis.fortlauderdale.gov/arcgis/rest/services/BuildingPermitTracker/BuildingPermitTracker/MapServer/0/query';

// ── Address utilities (same logic as miami-dade) ──────────────────────────────

function normalizeAddr(s) {
  return String(s).toUpperCase()
    .replace(/\b(STREET|STR)\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/(\d+)(ST|ND|RD|TH)\b/g, '$1')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function houseNum(s) { const m = String(s).match(/^(\d+)/); return m ? m[1] : ''; }

function bestMatch(hits, searched, addrField) {
  const sNorm  = normalizeAddr(searched);
  const sNum   = houseNum(searched.trim());
  const sWords = sNorm.split(' ').filter(w => w.length > 1 && !/^\d+$/.test(w));

  const scored = hits.map(hit => {
    const raw   = hit[addrField] || hit.SITEADDR || hit.SITE_ADDR || hit.ADDRESS || hit.PHY_ADDR1 || '';
    const hNorm = normalizeAddr(raw);
    const hNum  = houseNum(raw.trim());
    const hSet  = new Set(hNorm.split(' '));
    let score   = 0;
    if (sNum && hNum === sNum) score += 100;
    else if (sNum)             score -= 500;
    for (const w of sWords) if (hSet.has(w)) score += 20;
    return { hit, score, matched: raw };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 100 ? scored[0].hit : null;
}

// ── Broward GIS ──────────────────────────────────────────────────────────────

// Possible address field names in Broward GIS (we try all)
const ADDR_FIELDS = ['SITEADDR', 'SITE_ADDR', 'ADDRESS', 'FULL_ADDR', 'PROP_ADDR'];
const OUT_FIELDS  = 'FOLIO,SITEADDR,SITE_ADDR,ADDRESS,OWNER,OWNER1,OWN_NAME,YEARBUILT,YEAR_BUILT,LIVINGAREA,LIVING_AREA,JUSTVALUE,JUST_VALUE,JV,HOMESTEAD,HMSTD';

async function searchBrowardGIS(address) {
  const upper  = address.toUpperCase().trim();
  // Try each possible field name
  for (const field of ADDR_FIELDS) {
    const prefix = upper.substring(0, 20).replace(/'/g, "''");
    const params = new URLSearchParams({
      where:             `UPPER(${field}) LIKE '${prefix}%'`,
      outFields:         OUT_FIELDS,
      returnGeometry:    'false',
      resultRecordCount: '10',
      f:                 'json',
    });
    const url = `${BROWARD_GIS}?${params}`;
    console.log('[Broward GIS] trying field', field);
    try {
      const res  = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
      const data = await res.json();
      if (data.error) { console.log('[Broward GIS] field error:', data.error.message); continue; }
      const features = (data.features || []).map(f => f.attributes || {});
      if (!features.length) continue;
      const hit = bestMatch(features, address, field);
      if (hit) { console.log('[Broward GIS] matched via', field); return hit; }
    } catch(e) { console.log('[Broward GIS] fetch error:', e.message); }
  }
  return null;
}

async function searchBrowardByFolio(folio) {
  const f      = String(folio).replace(/\D/g, '');
  const params = new URLSearchParams({
    where:          `FOLIO='${f}'`,
    outFields:      OUT_FIELDS,
    returnGeometry: 'false',
    f:              'json',
  });
  const res  = await fetch(`${BROWARD_GIS}?${params}`, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.features || [])[0]?.attributes || null;
}

function pick(...vals) {
  for (const v of vals) if (v !== null && v !== undefined && v !== '') return v;
  return '';
}

function parseBrowardGIS(attr) {
  const folio       = pick(attr.FOLIO, attr.folio, attr.PARCEL_ID) || '';
  const ownerName   = pick(attr.OWNER, attr.OWNER1, attr.OWN_NAME, attr.OWNERNAME) || '';
  const siteAddr    = pick(attr.SITEADDR, attr.SITE_ADDR, attr.ADDRESS, attr.FULL_ADDR, attr.PROP_ADDR) || '';
  const municipality = pick(attr.CITY, attr.MUNI, attr.MUNICIPALITY) || 'Broward County';
  const yearBuilt   = pick(attr.YEARBUILT, attr.YEAR_BUILT, attr.YR_BLT) || '';
  const sqft        = pick(attr.LIVINGAREA, attr.LIVING_AREA, attr.SQFT, attr.BLDG_AREA) || '';
  const assessedValue = pick(attr.JUSTVALUE, attr.JUST_VALUE, attr.JV, attr.ASSESSED) || '';
  const homestead   = !!(attr.HOMESTEAD || attr.HMSTD || attr.HSTEAD);

  console.log('[Broward GIS attr keys]', Object.keys(attr).join(', '));

  return { folio, ownerName, municipality, yearBuilt, sqft, assessedValue, homestead, ownerMailing: '', address: siteAddr };
}

// ── Fort Lauderdale permits ───────────────────────────────────────────────────

async function getFtlPermits(parcelId) {
  const pid    = String(parcelId).replace(/\D/g, '');
  const params = new URLSearchParams({
    where:             `PARCELID='${pid}'`,
    outFields:         'PERMITID,PERMITTYPE,PERMITSTAT,PERMITDESC,APPROVEDT,CONTRACTOR,FULLADDR,ESTCOST',
    orderByFields:     'APPROVEDT DESC',
    resultRecordCount: '200',
    f:                 'json',
  });
  const res  = await fetch(`${FTL_BASE}?${params}`, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map(feat => {
    const a    = feat.attributes || {};
    const date = a.APPROVEDT ? new Date(a.APPROVEDT).toISOString().slice(0, 10) : '';
    return {
      permitNumber:  a.PERMITID   || '',
      type:          a.PERMITTYPE || '',
      description:   a.PERMITDESC || '',
      date,
      status:        a.PERMITSTAT || '',
      contractor:    a.CONTRACTOR || '',
      address:       a.FULLADDR   || '',
      estimatedCost: a.ESTCOST    || 0,
    };
  });
}

// ── Categorization & scoring ─────────────────────────────────────────────────

const ROOF_KW = /\b(roof|roofing|reroof|re-roof|shingle|tile roof|flat roof|metal roof)\b/i;
const AC_KW   = /\b(a\/c|ac|air.cond|hvac|mechanical|heat pump|mini.split|condenser)\b/i;
const ELEC_KW = /\b(electr|wiring|panel|service.change|meter|generator)\b/i;
const FTL_RE  = /fort.?lauderdale|ft.?laud/i;

function categorize(p) {
  const t = `${p.type} ${p.description}`;
  if (ROOF_KW.test(t)) return 'roof';
  if (AC_KW.test(t))   return 'ac';
  if (ELEC_KW.test(t)) return 'electric';
  return 'other';
}

function yearsSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}

function scoreRoof(permits) {
  const rp = permits.filter(p => p._category === 'roof');
  if (!rp.length) return { score: 'NO_DATA', label: 'SIN DATA', age: null, date: '', contractor: '', permitNumber: '' };
  const l   = rp[0];
  const age = yearsSince(l.date);
  let score, label;
  if (age === null)   { score = 'NO_DATA';  label = 'SIN DATA'; }
  else if (age >= 20) { score = 'CRITICAL'; label = 'CRITICO - Hot Lead'; }
  else if (age >= 10) { score = 'WARM';     label = 'ATENCION - Warm'; }
  else                { score = 'OK';       label = 'OK - Cold'; }
  return { score, label, age, date: l.date, contractor: l.contractor, permitNumber: l.permitNumber };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function scrapeBroward({ address, folio: folioInput }) {
  let parcelId = folioInput || null;
  let property = {};
  let attr     = null;

  if (parcelId) {
    attr = await searchBrowardByFolio(parcelId);
  } else {
    const streetOnly = address.toUpperCase()
      .replace(/,\s*(fort.?lauderdale|ft.?laud|hollywood|miramar|pembroke|coral springs|pompano|davie|plantation|sunrise|weston|deerfield|lauder|tamarac|hallandale|dania|cooper|coconut|parkland|margate|north lauderdale|oakland park).*/i, '')
      .replace(/,?\s*(fl|florida)\s*\d{5}(-\d{4})?/i, '')
      .replace(/,\s*\d{5}(-\d{4})?$/, '')
      .replace(/(\d+)(ST|ND|RD|TH)\b/gi, '$1')
      .trim();
    attr = await searchBrowardGIS(streetOnly);
  }

  if (!attr) throw new Error('Propiedad no encontrada en Broward County GIS');

  property = parseBrowardGIS(attr);
  parcelId = property.folio || parcelId;

  let rawPermits = [], querySource = '';
  if (FTL_RE.test(property.municipality) || FTL_RE.test(address)) {
    rawPermits  = await getFtlPermits(parcelId);
    querySource = 'Fort Lauderdale BuildingPermitTracker';
  } else {
    querySource = `Sin portal de permisos para ${property.municipality}`;
  }

  const permits = rawPermits.map(p => ({ ...p, _category: categorize(p), _age: yearsSince(p.date) }));
  return {
    property,
    permits,
    roofScore: scoreRoof(permits),
    summary: { county: 'broward', municipality: property.municipality, totalFound: permits.length, querySource },
  };
}

module.exports = { scrapeBroward };
