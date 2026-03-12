const axios = require('axios');
const { getJurisdiction } = require('../utils/jurisdictions');

const ROOF_CATS = new Set(['0082','0083','0084','0085','0086','0087','0088','0089','0090','0091','0092','0093','0094','0095','0107']);
const ROOF_KW = ['ROOF','SHINGLE','TILE','FLAT','SBS','SINGLE PLY','GRAVEL','METAL ROOF','ASPHALT','WOOD SHAKE'];
const ELEC_KW = ['ELECTRICAL','ELECTRIC','SOLAR','PANEL','SERVICE CHANGE','LOW VOLTAGE'];
const AC_KW   = ['A/C','AIR COND','HVAC','MECHANICAL','HEAT PUMP','MINI SPLIT','REFRIGERATION'];

function permitCategory(type, cat, desc) {
  const d = (desc || '').toUpperCase();
  const t = (type || '').toUpperCase();
  const c = String(cat || '').trim();
  if (ROOF_CATS.has(c) || ROOF_KW.some(k => d.includes(k))) return 'ROOF';
  if (t === 'ELEC' || ELEC_KW.some(k => d.includes(k) || t.includes(k))) return 'ELECTRIC';
  if (t === 'MECH' || AC_KW.some(k => d.includes(k) || t.includes(k)))   return 'AC';
  return 'OTHER';
}

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= 20) return { score: 'CRITICAL', label: 'CRITICO - Hot Lead', color: 'red',    age };
  if (age >= 10) return { score: 'WARN',     label: 'ATENCION - Warm',    color: 'yellow', age };
  return           { score: 'OK',           label: 'OK - Cold',           color: 'green',  age };
}

const PA_BASE = 'https://apps.miamidadepa.gov/PApublicServiceProxy/PaServicesProxy.ashx';
const PA_HEADERS = {
  'Accept':     'application/json, text/plain, */*',
  'Referer':    'https://apps.miamidadepa.gov/PropertySearch/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
};
const COUNTY_PERMIT_URL = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1/query';

const fmtDate = (p) => (p && p.month && p.year) ? `${p.month}/${p.year}` : null;
const fmtAge  = (p) => (p && p.year) ? new Date().getFullYear() - p.year : null;

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

  const addrRes = await axios.get(PA_BASE, {
    params: { Operation: 'GetAddress', clientAppName: 'PropertySearch', myUnit: '', from: 1, to: 200, myAddress: cleanAddress },
    headers: PA_HEADERS, timeout: 20000,
  });

  const list  = addrRes.data?.MinimumPropertyInfos || [];
  const match = list[0] || null;
  const strap = match?.Strap || null;
  const folio = strap ? strap.replace(/-/g, '') : null;
  const municipality = match?.Municipality || 'Unincorporated County';

  if (!folio) {
    return { county: 'miami-dade', municipality, score: 'NO_DATA', label: 'SIN DATA', color: 'purple', roofAge: null, latestRoofYear: null, permits: [], allPermits: [], error: 'No se encontro el folio para esta direccion' };
  }

  const paRes = await axios.get(PA_BASE, {
    params: { Operation: 'GetPropertySearchByFolio', clientAppName: 'PropertySearch', folioNumber: folio },
    headers: PA_HEADERS, timeout: 20000,
  });
  const pa = paRes.data;

  const ownerName   = pa?.OwnerInfos?.[0]?.Name || match?.Owner1 || null;
  const propInfo    = pa?.PropertyInfo;
  const assessment  = pa?.Assessment?.AssessmentInfos?.[0];
  const benefits    = pa?.Benefit?.BenefitInfos || [];
  const buildings   = pa?.Building?.BuildingInfos || [];
  const mailingAddr = pa?.MailingAddress;

  const hasHomestead  = benefits.some(b => b.Description === 'Homestead');
  const totalValue    = assessment?.TotalValue    || null;
  const assessedValue = assessment?.AssessedValue || null;
  const sqft          = propInfo?.BuildingHeatedArea || null;
  const lotSize       = propInfo?.LotSize            || null;
  const bedrooms      = propInfo?.BedroomCount       || null;
  const bathrooms     = propInfo?.BathroomCount      || null;
  const years         = buildings.map(b => b.Actual).filter(y => y && y > 1800);
  const yearBuilt     = years.length > 0 ? Math.min(...years) : null;
  const mailingFormatted = mailingAddr ? `${mailingAddr.Address1}, ${mailingAddr.City}, ${mailingAddr.State} ${mailingAddr.ZipCode}` : null;
  const isAbsentee    = !!(mailingFormatted && !mailingFormatted.includes(cleanAddress.split(' ')[0]));

  let allPermits = [];
  let permitSource = 'county-arcgis';
  const jurisdiction = getJurisdiction(municipality);

  if (jurisdiction?.scraper) {
    try {
      const cityScraper = require(`./${jurisdiction.scraper}`);
      const rawPerms    = await cityScraper.scrapePermits(folio, cleanAddress);
      permitSource      = jurisdiction.scraper;
      allPermits        = rawPerms.map(p => ({ ...p, category: p.category || permitCategory(p.type, p.cat, p.description) }));
    } catch (e) {
      console.error(`[miami-dade] Error en scraper ${jurisdiction.scraper}:`, e.message);
      allPermits   = await queryCountyLayer(folio);
      permitSource = 'county-arcgis-fallback';
    }
  } else {
    allPermits = await queryCountyLayer(folio);
  }

  const roofPerm = allPermits.find(p => p.category === 'ROOF')     || null;
  const elecPerm = allPermits.find(p => p.category === 'ELECTRIC') || null;
  const acPerm   = allPermits.find(p => p.category === 'AC')       || null;
  const roofYear  = roofPerm?.year || yearBuilt || null;
  const scoreData = calcScore(roofYear);

  return {
    county: 'miami-dade', municipality, permitSource,
    address: cleanAddress,
    folio:   propInfo?.FolioNumber || strap,
    ownerName,
    homestead:      hasHomestead ? 'SI' : 'NO',
    yearBuilt, sqft, lotSize, bedrooms, bathrooms,
    assessedValue, totalValue,
    mailingAddress: mailingFormatted,
    isAbsentee,
    latestRoofYear: roofPerm?.year || null,
    roofAge:        scoreData.age,
    score:          scoreData.score,
    label:          scoreData.label,
    color:          scoreData.color,
    sourceNote: roofPerm ? `Permiso de techo: ${fmtDate(roofPerm)} - ${municipality}` : yearBuilt ? `Sin permiso reciente - ano construccion: ${yearBuilt}` : 'Sin datos de techo',
    roofPermit: roofPerm ? { date: fmtDate(roofPerm), contractor: roofPerm.contractor, permitNo: roofPerm.permitNo } : null,
    elecPermit: elecPerm ? { date: fmtDate(elecPerm), contractor: elecPerm.contractor, permitNo: elecPerm.permitNo } : null,
    acPermit:   acPerm   ? { date: fmtDate(acPerm),   contractor: acPerm.contractor,   permitNo: acPerm.permitNo   } : null,
    ghlFields: {
      permit_county: 'Miami-Dade',
      permit_roof_score:             scoreData.score,
      permit_roof_age:               scoreData.age,
      permit_roof_date:              fmtDate(roofPerm),
      permit_roof_contractor:        roofPerm?.contractor || null,
      permit_roof_permit_number:     roofPerm?.permitNo   || null,
      permit_electric_age:           fmtAge(elecPerm),
      permit_electric_date:          fmtDate(elecPerm),
      permit_electric_contractor:    elecPerm?.contractor || null,
      permit_electric_permit_number: elecPerm?.permitNo   || null,
      permit_ac_age:                 fmtAge(acPerm),
      permit_ac_date:                fmtDate(acPerm),
      permit_ac_contractor:          acPerm?.contractor   || null,
      permit_ac_permit_number:       acPerm?.permitNo     || null,
      pa_owner_name:                 ownerName,
      pa_homestead:                  hasHomestead ? 'SI' : 'NO',
      pa_year_built:                 yearBuilt,
      pa_sqft:                       sqft,
      pa_assessed_value:             totalValue,
      pa_owner_mailing:              isAbsentee ? mailingFormatted : null,
      permit_total_found:            allPermits.length,
      permit_last_checked:           new Date().toLocaleString('en-US'),
      permit_query_source:           permitSource,
    },
    permits:    allPermits.filter(p => p.category === 'ROOF'),
    allPermits,
  };
}

async function queryCountyLayer(folio) {
  if (!folio) return [];
  try {
    const permRes = await axios.get(COUNTY_PERMIT_URL, {
      params: { where: `FOLIO = '${folio}'`, outFields: 'ADDRESS,FOLIO,TYPE,CAT1,DESC1,ISSUDATE,BPSTATUS,CONTRNAME,PROCNUM', resultRecordCount: 200, orderByFields: 'ISSUDATE DESC', f: 'json' },
      timeout: 20000,
    });
    return (permRes.data?.features?.map(f => f.attributes) || []).map(p => {
      const dt = p.ISSUDATE ? new Date(p.ISSUDATE) : null;
      return {
        date: dt ? dt.toLocaleDateString('en-US') : 'N/A',
        year: dt ? dt.getFullYear() : null,
        month: dt ? String(dt.getMonth() + 1).padStart(2, '0') : null,
        type: (p.TYPE || '').trim(), cat: (p.CAT1 || '').trim(), description: (p.DESC1 || '').trim(),
        status: (p.BPSTATUS || '').trim(), contractor: (p.CONTRNAME || '').trim(), permitNo: (p.PROCNUM || '').trim(),
        category: permitCategory(p.TYPE, p.CAT1, p.DESC1), source: 'county-arcgis',
      };
    });
  } catch (e) { console.error('[miami-dade] queryCountyLayer error:', e.message); return []; }
}

module.exports = { scrapeMiamiDade };
