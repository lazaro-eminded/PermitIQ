const axios = require('axios');
const config = require('../config');

// ─── Categorías de permisos ───────────────────────────────
const ROOF_CATS = new Set(['0082','0083','0084','0085','0086','0087','0088','0089','0090','0091','0092','0093','0094','0095','0107']);
const ROOF_KW   = ['ROOF','SHINGLE','TILE','FLAT','SBS','SINGLE PLY','GRAVEL','METAL ROOF','ASPHALT'];
const ELEC_KW   = ['ELECTRICAL','ELECTRIC','SOLAR','PANEL','SERVICE CHANGE'];
const AC_KW     = ['A/C','AC ','AIR COND','HVAC','MECHANICAL','HEAT PUMP','MINI SPLIT'];

function permitCategory(type, cat, desc) {
  const d = (desc || '').toUpperCase();
  const c = String(cat || '').trim();
  if (ROOF_CATS.has(c) || ROOF_KW.some(k => d.includes(k))) return 'ROOF';
  if (type === 'ELEC' || ELEC_KW.some(k => d.includes(k)))  return 'ELECTRIC';
  if (type === 'MECH' || AC_KW.some(k => d.includes(k)))    return 'AC';
  return 'OTHER';
}

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= config.ROOF_SCORE.CRITICAL_YEARS) return { score: 'CRITICAL', label: 'CRITICO — Hot Lead', color: 'red', age };
  if (age >= config.ROOF_SCORE.WARM_YEARS)     return { score: 'WARM',     label: 'ATENCION — Warm',   color: 'yellow', age };
  return { score: 'OK', label: 'OK — Cold', color: 'green', age };
}

const PA_BASE    = 'https://apps.miamidadepa.gov/PApublicServiceProxy/PaServicesProxy.ashx';
const PA_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://apps.miamidadepa.gov/PropertySearch/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
};
const PERMIT_URL = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1/query';

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

  // ── PASO 1: GetAddress → obtener folio ──────────────────
  const addrRes = await axios.get(PA_BASE, {
    params: { Operation: 'GetAddress', clientAppName: 'PropertySearch', myUnit: '', from: 1, to: 200, myAddress: cleanAddress },
    headers: PA_HEADERS,
    timeout: 20000
  });

  // Buscar el folio que mejor coincida con la dirección
  const addressList = addrRes.data?.Addresses || addrRes.data?.addresses || [];
  let folio = null;
  if (Array.isArray(addressList) && addressList.length > 0) {
    const match = addressList.find(a => {
      const addr = (a.Address || a.address || '').toUpperCase();
      return addr.includes(cleanAddress.split(' ').slice(0,2).join(' '));
    }) || addressList[0];
    folio = match?.FolioNumber || match?.folioNumber || match?.Folio || match?.folio || null;
    // Limpiar folio — quitar guiones
    if (folio) folio = folio.replace(/-/g, '');
  }

  if (!folio) {
    // Fallback: buscar en ArcGIS directo por dirección
    const arcRes = await axios.get(PERMIT_URL, {
      params: { where: `ADDRESS LIKE '${cleanAddress}%'`, outFields: 'FOLIO', resultRecordCount: 1, f: 'json' },
      timeout: 15000
    });
    folio = arcRes.data?.features?.[0]?.attributes?.FOLIO?.trim() || null;
  }

  // ── PASO 2: GetPropertySearchByFolio → datos del PA ─────
  let pa = null;
  if (folio) {
    const paRes = await axios.get(PA_BASE, {
      params: { Operation: 'GetPropertySearchByFolio', clientAppName: 'PropertySearch', folioNumber: folio },
      headers: PA_HEADERS,
      timeout: 20000
    });
    pa = paRes.data;
  }

  // ── PASO 3: Extraer datos del Property Appraiser ─────────
  const ownerName     = pa?.OwnerInfos?.[0]?.Name || null;
  const mailingAddr   = pa?.MailingAddress;
  const siteAddr      = pa?.SiteAddress?.[0];
  const propInfo      = pa?.PropertyInfo;
  const assessment    = pa?.Assessment?.AssessmentInfos?.find(a => a.Year === pa?.RollYear1);
  const benefits      = pa?.Benefit?.BenefitInfos || [];
  const building      = pa?.Building?.BuildingInfos?.filter(b => b.RollYear === pa?.RollYear1) || [];

  const hasHomestead  = benefits.some(b => b.Description === 'Homestead' && b.TaxYear === pa?.RollYear1);
  const assessedValue = assessment?.AssessedValue || null;
  const totalValue    = assessment?.TotalValue || null;
  const sqft          = propInfo?.BuildingHeatedArea || null;
  const lotSize       = propInfo?.LotSize || null;
  const bedrooms      = propInfo?.BedroomCount || null;
  const bathrooms     = propInfo?.BathroomCount || null;

  // Year built = el año más antiguo de los building segments
  const yearBuilt = building.length > 0
    ? Math.min(...building.map(b => b.Actual).filter(y => y > 1800))
    : null;

  // Absentee: mailing diferente al site address
  const mailingFull = mailingAddr ? `${mailingAddr.Address1} ${mailingAddr.City} ${mailingAddr.State}`.toUpperCase() : '';
  const siteFull    = siteAddr ? `${siteAddr.StreetNumber} ${siteAddr.StreetPrefix} ${siteAddr.StreetName} ${siteAddr.StreetSuffix}`.toUpperCase() : '';
  const isAbsentee  = mailingFull && siteFull && !mailingFull.includes(siteFull.split(' ').slice(0,2).join(' '));

  const folioFormatted = propInfo?.FolioNumber || folio;

  // ── PASO 4: Permisos ArcGIS por FOLIO ───────────────────
  let allPermitsRaw = [];
  if (folio) {
    const permRes = await axios.get(PERMIT_URL, {
      params: {
        where: `FOLIO = '${folio}'`,
        outFields: 'ADDRESS,FOLIO,TYPE,CAT1,DESC1,ISSUDATE,BPSTATUS,CONTRNAME,PROCNUM',
        resultRecordCount: 200,
        orderByFields: 'ISSUDATE DESC',
        f: 'json'
      },
      timeout: 20000
    });
    allPermitsRaw = permRes.data?.features?.map(f => f.attributes) || [];
  }

  // Formatear permisos con categoría
  const allPermits = allPermitsRaw.map(p => ({
    date:       p.ISSUDATE ? new Date(p.ISSUDATE).toLocaleDateString('en-US') : 'N/A',
    year:       p.ISSUDATE ? new Date(p.ISSUDATE).getFullYear() : null,
    month:      p.ISSUDATE ? String(new Date(p.ISSUDATE).getMonth() + 1).padStart(2,'0') : null,
    type:       (p.TYPE || '').trim(),
    cat:        (p.CAT1 || '').trim(),
    description:(p.DESC1 || '').trim(),
    status:     (p.BPSTATUS || '').trim(),
    contractor: (p.CONTRNAME || '').trim(),
    permitNo:   (p.PROCNUM || '').trim(),
    folio:      (p.FOLIO || '').trim(),
    category:   permitCategory(p.TYPE, p.CAT1, p.DESC1)
  }));

  // ── PASO 5: Último permiso por categoría ─────────────────
  const lastOf = (cat) => allPermits.find(p => p.category === cat) || null;
  const roofPerm  = lastOf('ROOF');
  const elecPerm  = lastOf('ELECTRIC');
  const acPerm    = lastOf('AC');

  // Roof year: permiso reciente > year_built > null
  const roofYear = roofPerm?.year || yearBuilt || null;
  const scoreData = calcScore(roofYear);

  return {
    county:       'miami-dade',
    address:      cleanAddress,
    folio:        folioFormatted,

    // Property Appraiser
    ownerName,
    homestead:    hasHomestead ? 'SI' : 'NO',
    yearBuilt,
    sqft,
    lotSize,
    bedrooms,
    bathrooms,
    assessedValue,
    totalValue,
    mailingAddress: mailingAddr ? `${mailingAddr.Address1}, ${mailingAddr.City}, ${mailingAddr.State} ${mailingAddr.ZipCode}` : null,
    isAbsentee,

    // Roof score
    latestRoofYear: roofPerm?.year || null,
    roofAge:    scoreData.age,
    score:      scoreData.score,
    label:      scoreData.label,
    color:      scoreData.color,
    sourceNote: roofPerm
      ? `Permiso de techo: ${roofPerm.date}`
      : yearBuilt
        ? `Sin permiso reciente — año construcción: ${yearBuilt}`
        : 'Sin datos de techo',

    // Permisos por categoría
    roofPermit:  roofPerm  ? { date: `${roofPerm.month}/${roofPerm.year}`,  contractor: roofPerm.contractor,  permitNo: roofPerm.permitNo  } : null,
    elecPermit:  elecPerm  ? { date: `${elecPerm.month}/${elecPerm.year}`,  contractor: elecPerm.contractor,  permitNo: elecPerm.permitNo  } : null,
    acPermit:    acPerm    ? { date: `${acPerm.month}/${acPerm.year}`,      contractor: acPerm.contractor,    permitNo: acPerm.permitNo    } : null,

    // GHL fields listos
    ghlFields: {
      permit_county:        'Miami-Dade',
      permit_roof_score:    scoreData.score,
      permit_roof_age:      scoreData.age,
      permit_roof_date:     roofPerm    ? `${roofPerm.month}/${roofPerm.year}`    : null,
      permit_roof_contractor: roofPerm  ? roofPerm.contractor                     : null,
      permit_roof_permit_number: roofPerm ? roofPerm.permitNo                     : null,
      permit_electric_age:  elecPerm   ? new Date().getFullYear() - elecPerm.year : null,
      permit_electric_date: elecPerm   ? `${elecPerm.month}/${elecPerm.year}`     : null,
      permit_electric_contractor: elecPerm ? elecPerm.contractor                  : null,
      permit_electric_permit_number: elecPerm ? elecPerm.permitNo                 : null,
      permit_ac_age:        acPerm     ? new Date().getFullYear() - acPerm.year   : null,
      permit_ac_date:       acPerm     ? `${acPerm.month}/${acPerm.year}`         : null,
      permit_ac_contractor: acPerm     ? acPerm.contractor                        : null,
      permit_ac_permit_number: acPerm  ? acPerm.permitNo                          : null,
      pa_owner_name:        ownerName,
      pa_homestead:         hasHomestead ? 'SI' : 'NO',
      pa_year_built:        yearBuilt,
      pa_sqft:              sqft,
      pa_assessed_value:    totalValue,
      pa_owner_mailing:     isAbsentee ? (mailingAddr ? `${mailingAddr.Address1}, ${mailingAddr.City}, ${mailingAddr.State}` : null) : null,
      permit_total_found:   allPermits.length,
      permit_last_checked:  new Date().toLocaleString('en-US'),
      permit_query_source:  'App',
    },

    permits: allPermits.filter(p => p.category === 'ROOF'),
    allPermits,
  };
}

module.exports = { scrapeMiamiDade };
