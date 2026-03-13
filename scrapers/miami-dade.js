/**
 * scrapers/miami-dade.js
 *
 * Steps:
 *  1. Miami-Dade PA API â†’ folio, owner, municipality, yearBuilt, sqft, value, homestead
 *  2. City Router (jurisdictions.js) â†’ pick permit scraper for this municipality
 *  3a. city-of-miami â†’ FeatureServer 2014â†’present (by FolioNumber)
 *  3b. county fallback â†’ ArcGIS county MapServer (rolling 3 years, by FOLIO)
 *  4. Categorize + score permits (roof / AC / electric)
 */

const { resolve } = require(''../utils/jurisdictions'');

// â”€â”€ PA API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PA_BASE = ''https://apps.miamidadepa.gov/PApublicServiceProxy/PaServicesProxy.ashx'';

async function searchAddress(address) {
  const url = `${PA_BASE}?Operation=GetAddress&clientAppName=PropertySearch&myUnit=&from=1&to=200&myAddress=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { ''User-Agent'': ''PermitIQ/1.0'' } });
  if (!res.ok) throw new Error(`PA address search failed: ${res.status}`);
  const data = await res.json();
  return (data.MinimumPropertyInfos || []);
}

async function getPropertyByFolio(folio) {
  // Strip all non-digit chars (PA API wants raw 13-digit folio)
  const f = String(folio).replace(/\D/g, '''');
  const url = `${PA_BASE}?Operation=GetPropertySearchByFolio&clientAppName=PropertySearch&folioNumber=${f}`;
  const res = await fetch(url, { headers: { ''User-Agent'': ''PermitIQ/1.0'' } });
  if (!res.ok) throw new Error(`PA folio lookup failed: ${res.status}`);
  return await res.json();
}

function parseProperty(data) {
  // PA returns a complex nested structure; we pull what we need
  const info  = data?.PropertyInfo || {};
  const bldg  = data?.BuildingInfo?.[0] || {};
  const land  = data?.LandInfo?.[0] || {};
  const sale  = data?.SaleInfos?.[0] || {};
  const owner = data?.OwnerInfos?.[0] || {};
  const ass   = data?.AssessmentInfos?.[0] || {};

  // Format folio as 13-digit string (PA returns e.g. "3022200020740")
  const folio = String(info.FolioNumber || '''').replace(/\D/g, '''');

  // Owner mailing address
  const mailingParts = [
    owner.MailAddress1, owner.MailAddress2, owner.MailCity, owner.MailState, owner.MailZipCode
  ].filter(Boolean);

  return {
    folio,
    ownerName:      owner.Name || '''',
    municipality:   info.Municipality || '''',
    yearBuilt:      bldg.ActualYear || bldg.EffectiveYear || '''',
    sqft:           bldg.LivingSqFt || bldg.AdjustedSqFt || '''',
    assessedValue:  ass.TotalValue || ass.JustValue || '''',
    homestead:      !!(ass.HomesteadExempt || ass.HomeSteadExemption),
    ownerMailing:   mailingParts.join('', ''),
    address:        info.SiteAddress || '''',
  };
}

// â”€â”€ County ArcGIS fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const COUNTY_ARCGIS =
  ''https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1/query'';

async function getCountyPermits(folio) {
  // Folio format in county ArcGIS: with dashes â†’ "30-2220-002-0740" NOT always,
  // actually stored as plain digits "3022200020740" or with leading zero.
  // Use both "=" and "LIKE" just in case.
  const f = String(folio).replace(/\D/g, '''');
  const params = new URLSearchParams({
    where:            `FOLIO=''${f}''`,
    outFields:        ''ADDRESS,FOLIO,TYPE,CAT1,DESC1,ISSUDATE,BPSTATUS,CONTRNAME,PROCNUM'',
    orderByFields:    ''ISSUDATE DESC'',
    resultRecordCount: 200,
    f:                ''json'',
  });
  const url = `${COUNTY_ARCGIS}?${params}`;
  const res = await fetch(url, { headers: { ''User-Agent'': ''PermitIQ/1.0'' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map(f => {
    const a = f.attributes || {};
    return {
      permitNumber: a.PROCNUM || '''',
      type:         a.TYPE    || '''',
      description:  a.DESC1   || a.CAT1 || '''',
      date:         a.ISSUDATE ? new Date(a.ISSUDATE).toISOString().slice(0, 10) : '''',
      status:       a.BPSTATUS || '''',
      contractor:   a.CONTRNAME || '''',
      address:      a.ADDRESS || '''',
    };
  });
}

// â”€â”€ City of Miami ArcGIS FeatureServer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MIAMI_CITY_URL =
  ''https://services1.arcgis.com/CvuPhqcTQpZPT9qY/arcgis/rest/services/Building_Permits_Since_2014/FeatureServer/0/query'';

async function getCityOfMiamiPermits(folio) {
  // FolioNumber field is Double â€” strip to integers
  const folioInt = parseInt(String(folio).replace(/\D/g, ''''), 10);
  const params = new URLSearchParams({
    where:            `FolioNumber=${folioInt}`,
    outFields:        ''FolioNumber,DeliveryAddress,PermitNumber,IssuedDate,ScopeofWork,WorkItems,CompanyName,BuildingPermitStatusDescription'',
    orderByFields:    ''IssuedDate DESC'',
    resultRecordCount: 200,
    f:                ''json'',
  });
  const url = `${MIAMI_CITY_URL}?${params}`;
  const res = await fetch(url, { headers: { ''User-Agent'': ''PermitIQ/1.0'' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map(f => {
    const a = f.attributes || {};
    const ms = a.IssuedDate;
    const date = ms ? new Date(ms).toISOString().slice(0, 10) : '''';
    return {
      permitNumber: a.PermitNumber || '''',
      type:         '''',
      description:  [a.ScopeofWork, a.WorkItems].filter(Boolean).join('' â€” ''),
      date,
      status:       a.BuildingPermitStatusDescription || '''',
      contractor:   a.CompanyName || '''',
      address:      a.DeliveryAddress || '''',
    };
  });
}

// â”€â”€ Permit categorization & scoring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ROOF_KEYWORDS    = /\b(roof|roofing|reroof|re-roof|shingle|tile roof|flat roof|metal roof)\b/i;
const AC_KEYWORDS      = /\b(a\/c|ac|air.cond|hvac|mechanical|heat pump|mini.split|condenser)\b/i;
const ELECTRIC_KEYWORDS= /\b(electr|wiring|panel|service.change|meter|generator)\b/i;

function categorize(permit) {
  const text = `${permit.type} ${permit.description}`;
  if (ROOF_KEYWORDS.test(text))     return ''roof'';
  if (AC_KEYWORDS.test(text))       return ''ac'';
  if (ELECTRIC_KEYWORDS.test(text)) return ''electric'';
  return ''other'';
}

function yearsSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}

function scoreRoof(permits) {
  const roofPerms = permits.filter(p => p._category === ''roof'');
  if (!roofPerms.length) {
    return { score: ''NO_DATA'', label: ''ðŸŸ£ SIN DATA'', age: null, date: '''', contractor: '''', permitNumber: '''' };
  }
  const latest = roofPerms[0]; // already sorted desc
  const age    = yearsSince(latest.date);
  let score, label;
  if (age === null)   { score = ''NO_DATA''; label = ''ðŸŸ£ SIN DATA''; }
  else if (age >= 20) { score = ''CRITICAL''; label = ''ðŸ”´ CRÃTICO â€” Hot Lead''; }
  else if (age >= 10) { score = ''WARM'';     label = ''ðŸŸ¡ ATENCIÃ“N â€” Warm''; }
  else                { score = ''OK'';       label = ''ðŸŸ¢ OK â€” Cold''; }
  return {
    score, label, age,
    date:         latest.date,
    contractor:   latest.contractor,
    permitNumber: latest.permitNumber,
  };
}

// â”€â”€ Main export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function scrapeMiamiDade({ address, folio: folioInput }) {
  let property = {};
  let folio    = folioInput || null;

  // â”€â”€ Step 1: PA lookup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!folio) {
    const hits = await searchAddress(address);
    if (!hits.length) throw new Error(''DirecciÃ³n no encontrada en PA Miami-Dade'');
    folio = String(hits[0].FolioNumber || hits[0].Folio || '''').replace(/\D/g, '''');
  }

  const paData = await getPropertyByFolio(folio);
  property     = parseProperty(paData);
  if (!property.folio) property.folio = folio;

  // â”€â”€ Step 2: City router â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const jurisdiction = resolve(property.municipality);

  // â”€â”€ Step 3: Get permits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let rawPermits  = [];
  let querySource = '''';

  if (jurisdiction.scraper === ''city-of-miami'') {
    rawPermits  = await getCityOfMiamiPermits(property.folio);
    querySource = ''City of Miami FeatureServer (2014â€“present)'';
  } else {
    rawPermits  = await getCountyPermits(property.folio);
    querySource = `County ArcGIS (${jurisdiction.name || ''Miami-Dade''})`;
  }

  // â”€â”€ Step 4: Annotate permits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const permits = rawPermits.map(p => ({
    ...p,
    _category: categorize(p),
    _age:      yearsSince(p.date),
  }));

  const roofScore = scoreRoof(permits);

  return {
    property,
    permits,
    roofScore,
    summary: {
      county:      ''miami-dade'',
      municipality: jurisdiction.name,
      totalFound:  permits.length,
      querySource,
    },
  };
}

module.exports = { scrapeMiamiDade };

