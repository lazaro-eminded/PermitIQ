/**
 * scrapers/broward.js
 */

const FDOT_BASE = 'https://gis.fdot.gov/arcgis/rest/services/Parcels/FeatureServer/6/query';
const FDOT_FIELDS = 'PARCEL_ID,OWN_NAME,OWN_ADDR1,OWN_ADDR2,OWN_CITY,OWN_STATE,OWN_ZIPCD,PHY_ADDR1,PHY_CITY,PHY_ZIPCD,ACT_YR_BLT,TOT_LVG_AR,JV,JV_HMSTD';

// Build FDOT URL manually so the % in LIKE is NOT double-encoded by URLSearchParams
function buildFDOTUrl(where) {
  const others = new URLSearchParams({
    outFields:          FDOT_FIELDS,
    returnGeometry:     'false',
    resultRecordCount:  '10',
    f:                  'json',
  }).toString();
  return `${FDOT_BASE}?where=${encodeURIComponent(where)}&${others}`;
}

async function searchFDOTByAddress(address) {
  // Uppercase and take first 20 chars for LIKE prefix
  const upper  = address.toUpperCase().trim();
  const prefix = upper.substring(0, 20).replace(/'/g, "''");
  const url    = buildFDOTUrl(`UPPER(PHY_ADDR1) LIKE '${prefix}%'`);
  console.log('[FDOT] address query:', url.substring(0, 200));
  const res  = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
  if (!res.ok) { console.error('[FDOT] HTTP', res.status); return []; }
  const data = await res.json();
  if (data.error) { console.error('[FDOT] error:', JSON.stringify(data.error)); return []; }
  return (data.features || []).map(f => f.attributes || {});
}

async function searchFDOTByParcel(parcelId) {
  const pid = String(parcelId).replace(/\D/g, '');
  const url = buildFDOTUrl(`PARCEL_ID='${pid}'`);
  const res  = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map(f => f.attributes || {});
}

function parseFDOT(attr) {
  const zip = attr.OWN_ZIPCD ? String(Math.round(attr.OWN_ZIPCD)).padStart(5, '0') : '';
  const mailingParts = [
    attr.OWN_ADDR1, attr.OWN_ADDR2, attr.OWN_CITY,
    attr.OWN_STATE, zip,
  ].filter(Boolean);
  return {
    folio:         attr.PARCEL_ID || '',
    ownerName:     attr.OWN_NAME  || '',
    municipality:  attr.PHY_CITY  || 'Broward County',
    yearBuilt:     attr.ACT_YR_BLT || '',
    sqft:          attr.TOT_LVG_AR  || '',
    assessedValue: attr.JV          || '',
    homestead:     !!(attr.JV_HMSTD && attr.JV_HMSTD > 0),
    ownerMailing:  mailingParts.join(', '),
    address:       [attr.PHY_ADDR1, attr.PHY_CITY, 'FL'].filter(Boolean).join(', '),
  };
}

// Fort Lauderdale BuildingPermitTracker
const FTL_BASE = 'https://gis.fortlauderdale.gov/arcgis/rest/services/BuildingPermitTracker/BuildingPermitTracker/MapServer/0/query';

async function getFtlPermits(parcelId) {
  const pid = String(parcelId).replace(/\D/g, '');
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
  const l = rp[0];
  const age = yearsSince(l.date);
  let score, label;
  if (age === null)   { score = 'NO_DATA';  label = 'SIN DATA'; }
  else if (age >= 20) { score = 'CRITICAL'; label = 'CRITICO - Hot Lead'; }
  else if (age >= 10) { score = 'WARM';     label = 'ATENCION - Warm'; }
  else                { score = 'OK';       label = 'OK - Cold'; }
  return { score, label, age, date: l.date, contractor: l.contractor, permitNumber: l.permitNumber };
}

// Strip street-level address: just "NUMBER DIRECTION STREET" without city/state/zip
function toStreetOnly(address) {
  return address
    .replace(/,\s*(fort.?lauderdale|ft.?laud|hollywood|miramar|pembroke|coral springs|pompano|davie|plantation|sunrise|weston|deerfield|lauder|tamarac|hallandale|dania|cooper|coconut|parkland|margate|north lauderdale|oakland park).*/i, '')
    .replace(/,?\s*(fl|florida)\s*\d{5}(-\d{4})?/i, '')
    .replace(/,\s*\d{5}(-\d{4})?$/, '')
    .trim()
    .toUpperCase();
}

async function scrapeBroward({ address, folio: folioInput }) {
  let parcelId = folioInput || null;
  let property = {};

  let fdotRecords = [];
  if (parcelId) {
    fdotRecords = await searchFDOTByParcel(parcelId);
  } else {
    const streetOnly = toStreetOnly(address);
    fdotRecords = await searchFDOTByAddress(streetOnly);
  }

  if (!fdotRecords.length) {
    throw new Error('Propiedad no encontrada en Broward (FDOT Parcels)');
  }

  property = parseFDOT(fdotRecords[0]);
  parcelId = property.folio || parcelId;

  let rawPermits = [], querySource = '';
  if (FTL_RE.test(property.municipality)) {
    rawPermits  = await getFtlPermits(parcelId);
    querySource = 'Fort Lauderdale BuildingPermitTracker';
  } else {
    querySource = `Sin portal de permisos para ${property.municipality}`;
  }

  const permits = rawPermits.map(p => ({ ...p, _category: categorize(p), _age: yearsSince(p.date) }));
  return {
    property,
    permits,
    roofScore:  scoreRoof(permits),
    summary: { county: 'broward', municipality: property.municipality, totalFound: permits.length, querySource },
  };
}

module.exports = { scrapeBroward };
