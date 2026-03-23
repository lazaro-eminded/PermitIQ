/**
 * scrapers/miami-dade.js
 */

const { resolve } = require('../utils/jurisdictions');

const PA_BASE = 'https://apps.miamidadepa.gov/PApublicServiceProxy/PaServicesProxy.ashx';

// ── Address utilities ────────────────────────────────────────────────────────

function normalizeAddr(s) {
  return String(s).toUpperCase()
    .replace(/\b(STREET|STR)\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bCOURT\b/g, 'CT')
    .replace(/\bTERRACE\b/g, 'TER')
    .replace(/\bPLACE\b/g, 'PL')
    .replace(/\bLANE\b/g, 'LN')
    .replace(/(\d+)(ST|ND|RD|TH)\b/g, '$1')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function houseNum(s) {
  const m = String(s).match(/^(\d+)/);
  return m ? m[1] : '';
}

// Pick the hit whose address best matches what was searched.
// Returns null if no hit has a matching house number.
function bestMatch(hits, searched) {
  const sNorm  = normalizeAddr(searched);
  const sNum   = houseNum(searched.trim());
  const sWords = sNorm.split(' ').filter(w => w.length > 1 && !/^\d+$/.test(w));

  const scored = hits.map(hit => {
    const raw   = hit.Address || hit.SiteAddress || hit.address || hit.StreetAddress || '';
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
  if (scored[0]?.score >= 100) return scored[0].hit;
  return null;
}

// Strip city/state/zip — keep only street for PA search
function toStreetOnly(address) {
  return address
    .replace(/,\s*(miami[\w\s]*|hialeah|coral gables|homestead|doral|aventura|kendall|cutler bay|palmetto bay|pinecrest|surfside|sweetwater|medley|opa.?locka|florida city|key biscayne|north miami[\w\s]*|south miami|west miami).*/i, '')
    .replace(/,?\s*(fl|florida)\s*\d{5}(-\d{4})?/i, '')
    .replace(/,\s*\d{5}(-\d{4})?$/, '')
    .replace(/(\d+)(st|nd|rd|th)\b/gi, '$1')
    .trim();
}

async function paSearch(query) {
  const url = `${PA_BASE}?Operation=GetAddress&clientAppName=PropertySearch&myUnit=&from=1&to=200&myAddress=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.MinimumPropertyInfos || data.Hits || data.Results || (Array.isArray(data) ? data : []);
}

async function searchAddress(address) {
  const street = toStreetOnly(address);

  // Attempt 1: exact cleaned street (e.g. "11900 SW 97 Ave")
  console.log('[PA] attempt 1:', street);
  let hits = await paSearch(street);
  let match = bestMatch(hits, address);
  if (match) return match;

  // Attempt 2: uppercase (PA may be case-sensitive)
  const upper = street.toUpperCase();
  if (upper !== street) {
    console.log('[PA] attempt 2 uppercase:', upper);
    hits = await paSearch(upper);
    match = bestMatch(hits, address);
    if (match) return match;
  }

  // Attempt 3: abbreviate Ave/St/Blvd to bare number+direction+number
  // e.g. "11900 SW 97 Ave" -> "11900 SW 97"  (only if street name is a number)
  const parts = street.toUpperCase().split(' ');
  if (parts.length >= 3 && /^\d+$/.test(parts[2])) {
    const num3 = parts.slice(0, 3).join(' ');
    console.log('[PA] attempt 3 numeric street:', num3);
    hits = await paSearch(num3);
    match = bestMatch(hits, address);
    if (match) return match;
  }

  return null;
}

// ── PA folio lookup ──────────────────────────────────────────────────────────

async function getPropertyByFolio(folio) {
  const f   = String(folio).replace(/\D/g, '');
  const url = `${PA_BASE}?Operation=GetPropertySearchByFolio&clientAppName=PropertySearch&folioNumber=${f}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
  if (!res.ok) throw new Error(`PA folio lookup failed: ${res.status}`);
  return await res.json();
}

function pick(...vals) {
  for (const v of vals) if (v !== null && v !== undefined && v !== '') return v;
  return '';
}

function parseProperty(data) {
  console.log('[PA topKeys]', Object.keys(data || {}).join(', '));

  const info   = data?.PropertyInfo   || data?.propertyInfo  || data?.Property || {};
  const owners = data?.OwnerInfos     || data?.ownerInfos    || data?.Owners   || [];
  const bldgs  = data?.BuildingInfos  || data?.buildingInfos || data?.Buildings || data?.BuildingInfo || [];
  const asses  = data?.AssessmentInfos || data?.assessmentInfos || data?.Assessments || [];

  const owner = (Array.isArray(owners) ? owners[0] : owners) || {};
  const bldg  = (Array.isArray(bldgs)  ? bldgs[0]  : bldgs)  || {};
  const ass   = (Array.isArray(asses)  ? asses[0]  : asses)   || {};

  console.log('[PA owner keys]', Object.keys(owner).join(', '));
  console.log('[PA bldg keys]',  Object.keys(bldg).join(', '));
  console.log('[PA ass keys]',   Object.keys(ass).join(', '));

  const folio = String(pick(
    info.FolioNumber, info.folioNumber, info.Folio,
    data.FolioNumber, data.Folio
  )).replace(/\D/g, '');

  const ownerName = pick(owner.Name, owner.name, owner.OwnerName, owner.ownerName, owner.LastName);

  const mailingParts = [
    pick(owner.MailAddress1, owner.mailAddress1, owner.Address1, owner.MailingAddress),
    pick(owner.MailAddress2, owner.mailAddress2, owner.Address2),
    pick(owner.MailCity,     owner.mailCity,     owner.City),
    pick(owner.MailState,    owner.mailState,    owner.State),
    pick(owner.MailZipCode,  owner.mailZipCode,  owner.ZipCode, owner.Zip),
  ].filter(Boolean);

  const yearBuilt     = pick(bldg.ActualYear, bldg.actualYear, bldg.YearBuilt, bldg.yearBuilt, bldg.EffectiveYear, bldg.ActYear);
  const sqft          = pick(bldg.LivingSqFt, bldg.livingSqFt, bldg.LivingArea, bldg.AdjustedSqFt, bldg.TotalSqFt);
  const assessedValue = pick(ass.TotalValue, ass.totalValue, ass.JustValue, ass.justValue, ass.AssessedValue);
  const homestead     = !!(ass.HomesteadExempt || ass.homesteadExempt || ass.HomeSteadExemption || ass.Homestead);
  const municipality  = pick(info.Municipality, info.municipality, info.City, data.Municipality);
  const address       = pick(info.SiteAddress, info.siteAddress, info.Address, data.SiteAddress);

  return { folio, ownerName, municipality, yearBuilt, sqft, assessedValue, homestead, ownerMailing: mailingParts.join(', '), address };
}

// ── Permit sources ────────────────────────────────────────────────────────────

const COUNTY_ARCGIS = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1/query';

async function getCountyPermits(folio) {
  const f      = String(folio).replace(/\D/g, '');
  const params = new URLSearchParams({
    where:             `FOLIO='${f}'`,
    outFields:         'ADDRESS,FOLIO,TYPE,CAT1,DESC1,ISSUDATE,BPSTATUS,CONTRNAME,PROCNUM',
    orderByFields:     'ISSUDATE DESC',
    resultRecordCount: '200',
    f:                 'json',
  });
  const res  = await fetch(`${COUNTY_ARCGIS}?${params}`, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map(feat => {
    const a = feat.attributes || {};
    return {
      permitNumber: a.PROCNUM   || '',
      type:         a.TYPE      || '',
      description:  a.DESC1    || a.CAT1 || '',
      date:         a.ISSUDATE ? new Date(a.ISSUDATE).toISOString().slice(0, 10) : '',
      status:       a.BPSTATUS  || '',
      contractor:   a.CONTRNAME || '',
      address:      a.ADDRESS   || '',
    };
  });
}

const MIAMI_CITY_URL = 'https://services1.arcgis.com/CvuPhqcTQpZPT9qY/arcgis/rest/services/Building_Permits_Since_2014/FeatureServer/0/query';

async function getCityOfMiamiPermits(folio) {
  const folioInt = parseInt(String(folio).replace(/\D/g, ''), 10);
  const params   = new URLSearchParams({
    where:             `FolioNumber=${folioInt}`,
    outFields:         'FolioNumber,DeliveryAddress,PermitNumber,IssuedDate,ScopeofWork,WorkItems,CompanyName,BuildingPermitStatusDescription',
    orderByFields:     'IssuedDate DESC',
    resultRecordCount: '200',
    f:                 'json',
  });
  const res  = await fetch(`${MIAMI_CITY_URL}?${params}`, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map(feat => {
    const a = feat.attributes || {};
    return {
      permitNumber: a.PermitNumber || '',
      type:         '',
      description:  [a.ScopeofWork, a.WorkItems].filter(Boolean).join(' - '),
      date:         a.IssuedDate ? new Date(a.IssuedDate).toISOString().slice(0, 10) : '',
      status:       a.BuildingPermitStatusDescription || '',
      contractor:   a.CompanyName || '',
      address:      a.DeliveryAddress || '',
    };
  });
}

// ── Categorization & scoring ─────────────────────────────────────────────────

const ROOF_KW = /\b(roof|roofing|reroof|re-roof|shingle|tile roof|flat roof|metal roof)\b/i;
const AC_KW   = /\b(a\/c|ac|air.cond|hvac|mechanical|heat pump|mini.split|condenser)\b/i;
const ELEC_KW = /\b(electr|wiring|panel|service.change|meter|generator)\b/i;

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

async function scrapeMiamiDade({ address, folio: folioInput }) {
  let folio    = folioInput || null;
  let property = {};

  if (!folio) {
    const hit = await searchAddress(address);
    if (!hit) throw new Error('Direccion no encontrada en PA Miami-Dade');
    folio = String(
      hit.FolioNumber || hit.folioNumber || hit.Folio || hit.folio || ''
    ).replace(/\D/g, '');
    console.log('[PA] matched folio:', folio, '| address in PA:', hit.Address || hit.SiteAddress || '');
  }

  if (!folio) throw new Error('No se pudo obtener el folio para esta direccion');

  const paData = await getPropertyByFolio(folio);
  property = parseProperty(paData);
  if (!property.folio) property.folio = folio;

  const jurisdiction = resolve(property.municipality);
  let rawPermits = [], querySource = '';

  if (jurisdiction.scraper === 'city-of-miami') {
    rawPermits  = await getCityOfMiamiPermits(property.folio);
    querySource = 'City of Miami FeatureServer (2014-present)';
  } else {
    rawPermits  = await getCountyPermits(property.folio);
    querySource = `County ArcGIS (${jurisdiction.name || 'Miami-Dade'})`;
  }

  const permits   = rawPermits.map(p => ({ ...p, _category: categorize(p), _age: yearsSince(p.date) }));
  const roofScore = scoreRoof(permits);

  return {
    property,
    permits,
    roofScore,
    summary: { county: 'miami-dade', municipality: jurisdiction.name, totalFound: permits.length, querySource },
  };
}

module.exports = { scrapeMiamiDade };
