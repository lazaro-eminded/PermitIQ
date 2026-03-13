/**
 * scrapers/broward.js
 *
 * Steps:
 *  1. FDOT Statewide Parcels FeatureServer (Layer 6 = Broward)
 *     â†’ owner, year built, sqft, assessed value, homestead
 *  2. Fort Lauderdale BuildingPermitTracker ArcGIS (by PARCELID)
 *     â†’ permits for Fort Lauderdale addresses only; empty array for rest
 *  3. Categorize + score permits
 */

// â”€â”€ FDOT Parcel layer for Broward â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FDOT_URL = ''https://gis.fdot.gov/arcgis/rest/services/Parcels/FeatureServer/6/query'';

const FDOT_FIELDS = [
  ''PARCEL_ID'',''OWN_NAME'',
  ''OWN_ADDR1'',''OWN_ADDR2'',''OWN_CITY'',''OWN_STATE'',''OWN_ZIPCD'',
  ''PHY_ADDR1'',''PHY_ADDR2'',''PHY_CITY'',''PHY_ZIPCD'',
  ''ACT_YR_BLT'',''TOT_LVG_AR'',''JV'',''JV_HMSTD'',
].join('','');

/**
 * searchFDOTByAddress(address)
 * Searches physical address (PHY_ADDR1) using LIKE query.
 * Returns array of matching parcel records.
 */
async function searchFDOTByAddress(address) {
  // Normalise: uppercase, trim to street number + first word of street name
  const upper  = address.toUpperCase().trim();
  // Use first ~15 chars to keep the LIKE broad but not too broad
  const prefix = upper.substring(0, 15).replace(/''/g, "''''");
  const params = new URLSearchParams({
    where:            `UPPER(PHY_ADDR1) LIKE ''${prefix}%''`,
    outFields:        FDOT_FIELDS,
    returnGeometry:   false,
    resultRecordCount: 10,
    f:                ''json'',
  });
  const res = await fetch(`${FDOT_URL}?${params}`, { headers: { ''User-Agent'': ''PermitIQ/1.0'' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map(f => f.attributes || {});
}

/**
 * searchFDOTByParcel(parcelId)
 * Exact lookup by PARCEL_ID (Broward 12-digit folio).
 */
async function searchFDOTByParcel(parcelId) {
  const pid = String(parcelId).replace(/\D/g, '''');
  const params = new URLSearchParams({
    where:            `PARCEL_ID=''${pid}''`,
    outFields:        FDOT_FIELDS,
    returnGeometry:   false,
    resultRecordCount: 5,
    f:                ''json'',
  });
  const res = await fetch(`${FDOT_URL}?${params}`, { headers: { ''User-Agent'': ''PermitIQ/1.0'' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map(f => f.attributes || {});
}

function parseFDOT(attr) {
  const mailingParts = [
    attr.OWN_ADDR1, attr.OWN_ADDR2, attr.OWN_CITY, attr.OWN_STATE,
    attr.OWN_ZIPCD ? String(Math.round(attr.OWN_ZIPCD)).padStart(5, ''0'') : '''',
  ].filter(Boolean);

  return {
    folio:          attr.PARCEL_ID || '''',
    ownerName:      attr.OWN_NAME  || '''',
    municipality:   attr.PHY_CITY  || ''Broward County'',
    yearBuilt:      attr.ACT_YR_BLT || '''',
    sqft:           attr.TOT_LVG_AR  || '''',
    assessedValue:  attr.JV          || '''',
    homestead:      !!(attr.JV_HMSTD && attr.JV_HMSTD > 0),
    ownerMailing:   mailingParts.join('', ''),
    address:        [attr.PHY_ADDR1, attr.PHY_CITY, ''FL''].filter(Boolean).join('', ''),
  };
}

// â”€â”€ Fort Lauderdale BuildingPermitTracker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FTL_URL =
  ''https://gis.fortlauderdale.gov/arcgis/rest/services/BuildingPermitTracker/BuildingPermitTracker/MapServer/0/query'';

async function getFtlPermits(parcelId) {
  const pid = String(parcelId).replace(/\D/g, '''');
  const params = new URLSearchParams({
    where:            `PARCELID=''${pid}''`,
    outFields:        ''PERMITID,PERMITTYPE,PERMITSTAT,PERMITDESC,APPROVEDT,CONTRACTOR,FULLADDR,ESTCOST'',
    orderByFields:    ''APPROVEDT DESC'',
    resultRecordCount: 200,
    f:                ''json'',
  });
  const res = await fetch(`${FTL_URL}?${params}`, { headers: { ''User-Agent'': ''PermitIQ/1.0'' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map(f => {
    const a = f.attributes || {};
    const ms = a.APPROVEDT;
    const date = ms ? new Date(ms).toISOString().slice(0, 10) : '''';
    return {
      permitNumber: a.PERMITID   || '''',
      type:         a.PERMITTYPE || '''',
      description:  a.PERMITDESC || '''',
      date,
      status:       a.PERMITSTAT || '''',
      contractor:   a.CONTRACTOR || '''',
      address:      a.FULLADDR   || '''',
      estimatedCost: a.ESTCOST   || 0,
    };
  });
}

// â”€â”€ Permit categorization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ROOF_KEYWORDS     = /\b(roof|roofing|reroof|re-roof|shingle|tile roof|flat roof|metal roof)\b/i;
const AC_KEYWORDS       = /\b(a\/c|ac|air.cond|hvac|mechanical|heat pump|mini.split|condenser)\b/i;
const ELECTRIC_KEYWORDS = /\b(electr|wiring|panel|service.change|meter|generator)\b/i;

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
  const latest = roofPerms[0];
  const age    = yearsSince(latest.date);
  let score, label;
  if (age === null)   { score = ''NO_DATA''; label = ''ðŸŸ£ SIN DATA''; }
  else if (age >= 20) { score = ''CRITICAL''; label = ''ðŸ”´ CRÃTICO â€” Hot Lead''; }
  else if (age >= 10) { score = ''WARM'';     label = ''ðŸŸ¡ ATENCIÃ“N â€” Warm''; }
  else                { score = ''OK'';       label = ''ðŸŸ¢ OK â€” Cold''; }
  return { score, label, age, date: latest.date, contractor: latest.contractor, permitNumber: latest.permitNumber };
}

// â”€â”€ Determine if address is in Fort Lauderdale â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FTL_ALIASES = /fort.?lauderdale|ft.?laud/i;

function isFortLauderdale(city) {
  return FTL_ALIASES.test(city || '''');
}

// â”€â”€ Main export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function scrapeBroward({ address, folio: folioInput }) {
  let property = {};
  let parcelId = folioInput || null;

  // â”€â”€ Step 1: FDOT parcel lookup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let fdotRecords = [];
  if (parcelId) {
    fdotRecords = await searchFDOTByParcel(parcelId);
  } else {
    fdotRecords = await searchFDOTByAddress(address);
  }

  if (fdotRecords.length === 0) {
    throw new Error(''Propiedad no encontrada en Broward (FDOT Parcels)'');
  }

  property = parseFDOT(fdotRecords[0]);
  parcelId = property.folio || parcelId;

  // â”€â”€ Step 2: Permits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let rawPermits  = [];
  let querySource = '''';

  if (isFortLauderdale(property.municipality)) {
    rawPermits  = await getFtlPermits(parcelId);
    querySource = ''Fort Lauderdale BuildingPermitTracker'';
  } else {
    // No public permit API for other Broward cities â€” return empty
    querySource = `No portal de permisos disponible para ${property.municipality}`;
  }

  // â”€â”€ Step 3: Annotate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      county:      ''broward'',
      municipality: property.municipality,
      totalFound:  permits.length,
      querySource,
    },
  };
}

module.exports = { scrapeBroward };

