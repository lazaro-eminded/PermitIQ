/**
 * scrapers/miami-dade.js
 */

const { resolve } = require('../utils/jurisdictions');

const PA_BASE = 'https://apps.miamidadepa.gov/PApublicServiceProxy/PaServicesProxy.ashx';

// PA stores streets WITHOUT ordinal suffixes: "97 AVE" not "97th AVE"
function stripOrdinals(s) {
  return s.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');
}

// Keep only the street portion for PA search
function toStreetOnly(address) {
  let s = address
    .replace(/,\s*(miami[\w\s]*|hialeah|coral gables|homestead|doral|aventura|kendall|cutler bay|palmetto bay|pinecrest|surfside|sweetwater|medley|opa.?locka|florida city|key biscayne|north miami[\w\s]*|south miami|west miami).*/i, '')
    .replace(/,?\s*(fl|florida)\s*\d{5}(-\d{4})?/i, '')
    .replace(/,\s*\d{5}(-\d{4})?$/, '')
    .trim();
  return stripOrdinals(s);
}

async function paSearch(query) {
  const url = `${PA_BASE}?Operation=GetAddress&clientAppName=PropertySearch&myUnit=&from=1&to=200&myAddress=${encodeURIComponent(query)}`;
  const res  = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.MinimumPropertyInfos || data.Hits || data.Results || (Array.isArray(data) ? data : []);
}

async function searchAddress(address) {
  // Attempt 1: clean street only, ordinals stripped
  const street = toStreetOnly(address);
  console.log('[PA] attempt 1:', street);
  let hits = await paSearch(street);
  if (hits.length) return hits;

  // Attempt 2: just number + direction + street name (no suffix)
  // e.g. "11900 SW 97 Ave" -> "11900 SW 97"
  const parts = street.split(' ');
  const short = parts.slice(0, 3).join(' ');
  if (short !== street) {
    console.log('[PA] attempt 2:', short);
    hits = await paSearch(short);
    if (hits.length) return hits;
  }

  // Attempt 3: just number + street word
  const shorter = parts.slice(0, 2).join(' ');
  if (shorter !== short) {
    console.log('[PA] attempt 3:', shorter);
    hits = await paSearch(shorter);
    if (hits.length) return hits;
  }

  return [];
}

async function getPropertyByFolio(folio) {
  const f   = String(folio).replace(/\D/g, '');
  const url = `${PA_BASE}?Operation=GetPropertySearchByFolio&clientAppName=PropertySearch&folioNumber=${f}`;
  const res  = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
  if (!res.ok) throw new Error(`PA folio lookup failed: ${res.status}`);
  return await res.json();
}

function pick(...vals) {
  for (const v of vals) if (v !== null && v !== undefined && v !== '') return v;
  return '';
}

function parseProperty(data) {
  console.log('[PA Raw]', JSON.stringify(data).substring(0, 400));

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

// County ArcGIS (rolling 3 years)
const COUNTY_ARCGIS = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1/query';

async function getCountyPermits(folio) {
  const f      = String(folio).replace(/\D/g, '');
  const params = new URLSearchParams({
    where: `FOLIO='${f}'`,
    outFields: 'ADDRESS,FOLIO,TYPE,CAT1,DESC1,ISSUDATE,BPSTATUS,CONTRNAME,PROCNUM',
    orderByFields: 'ISSUDATE DESC',
    resultRecordCount: '200',
    f: 'json',
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

// City of Miami FeatureServer (2014-present)
const MIAMI_CITY_URL = 'https://services1.arcgis.com/CvuPhqcTQpZPT9qY/arcgis/rest/services/Building_Permits_Since_2014/FeatureServer/0/query';

async function getCityOfMiamiPermits(folio) {
  const folioInt = parseInt(String(folio).replace(/\D/g, ''), 10);
  const params   = new URLSearchParams({
    where: `FolioNumber=${folioInt}`,
    outFields: 'FolioNumber,DeliveryAddress,PermitNumber,IssuedDate,ScopeofWork,WorkItems,CompanyName,BuildingPermitStatusDescription',
    orderByFields: 'IssuedDate DESC',
    resultRecordCount: '200',
    f: 'json',
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
  const l = rp[0];
  const age = yearsSince(l.date);
  let score, label;
  if (age === null)   { score = 'NO_DATA';  label = 'SIN DATA'; }
  else if (age >= 20) { score = 'CRITICAL'; label = 'CRITICO - Hot Lead'; }
  else if (age >= 10) { score = 'WARM';     label = 'ATENCION - Warm'; }
  else                { score = 'OK';       label = 'OK - Cold'; }
  return { score, label, age, date: l.date, contractor: l.contractor, permitNumber: l.permitNumber };
}

async function scrapeMiamiDade({ address, folio: folioInput }) {
  let folio    = folioInput || null;
  let property = {};

  if (!folio) {
    const hits = await searchAddress(address);
    if (!hits.length) throw new Error('Direccion no encontrada en PA Miami-Dade');
    folio = String(
      hits[0].FolioNumber || hits[0].folioNumber || hits[0].Folio || hits[0].folio || ''
    ).replace(/\D/g, '');
    console.log('[PA] folio found:', folio);
  }

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
