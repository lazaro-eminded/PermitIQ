const axios = require('axios');
const config = require('../config');

const ROOF_CATS = new Set(['0092','0082','0107','0083','0084','0085','0086','0087','0088','0089','0090','0091','0093','0094','0095']);
const ROOF_KEYWORDS = ['ROOF','SHINGLE','TILE','FLAT','SBS','SINGLE PLY','GRAVEL','METAL ROOF'];

function isRoof(cat, desc) {
  if (ROOF_CATS.has(String(cat).trim())) return true;
  if (desc && ROOF_KEYWORDS.some(k => String(desc).toUpperCase().includes(k))) return true;
  return false;
}

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= config.ROOF_SCORE.CRITICAL_YEARS) return { score: 'CRITICAL', label: 'CRITICO — Hot Lead', color: 'red', age };
  if (age >= config.ROOF_SCORE.WARM_YEARS)     return { score: 'WARM', label: 'ATENCION — Warm', color: 'yellow', age };
  return { score: 'OK', label: 'OK — Cold', color: 'green', age };
}

const PA_API = 'https://www.miamidade.gov/Apps/PA/PApublicServiceProxy/PaServicesProxy.ashx';
const PERMIT_LAYER = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1/query';

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

  // Paso 1: Property Appraiser API — obtener FOLIO y año de construcción
  const paRes = await axios.get(PA_API, {
    params: {
      Operation: 'GetPropertySearchByAddress',
      clientAppName: 'PropertySearch',
      enPoint: 'Address',
      myAddress: cleanAddress,
      myUnit: ''
    },
    headers: { 'Accept': 'application/json', 'Referer': 'https://www.miamidade.gov/Apps/PA/propertysearch/' },
    timeout: 20000
  }).catch(e => ({ data: { error: e.message } }));

  const paData = paRes.data;
  const paInfo = Array.isArray(paData?.MinimumPropertyInfos?.PropertyInfo)
    ? paData.MinimumPropertyInfos.PropertyInfo[0]
    : paData?.MinimumPropertyInfos?.PropertyInfo || null;

  const folio = paInfo?.Strap?.replace(/-/g, '') || null;
  const yearBuilt = paInfo?.YearBuilt ? parseInt(paInfo.YearBuilt) : null;

  // Paso 2: permisos recientes por FOLIO (últimos 3 años en ArcGIS)
  let recentPermits = [];
  if (folio) {
    const permRes = await axios.get(PERMIT_LAYER, {
      params: {
        where: `FOLIO = '${folio}'`,
        outFields: 'ADDRESS,FOLIO,TYPE,CAT1,DESC1,ISSUDATE,BPSTATUS',
        resultRecordCount: 100,
        orderByFields: 'ISSUDATE DESC',
        f: 'json'
      },
      timeout: 15000
    }).catch(e => ({ data: { error: e.message } }));
    recentPermits = permRes.data?.features?.map(f => f.attributes) || [];
  }

  // Paso 3: calcular roof year
  const roofPermits = recentPermits.filter(p => isRoof(p.CAT1, p.DESC1));
  let latestRoofYear = null;
  if (roofPermits.length > 0) {
    const ts = roofPermits[0].ISSUDATE;
    latestRoofYear = ts ? new Date(ts).getFullYear() : null;
  }

  // Si no hay permiso de techo reciente, usar year_built como base
  const roofYear = latestRoofYear || yearBuilt;
  const scoreData = calcScore(roofYear);

  const allPermits = recentPermits.map(p => ({
    date: p.ISSUDATE ? new Date(p.ISSUDATE).toLocaleDateString('en-US') : 'N/A',
    type: p.TYPE,
    description: (p.DESC1 || '').trim(),
    status: p.BPSTATUS,
    isRoof: isRoof(p.CAT1, p.DESC1)
  }));

  return {
    county: 'miami-dade',
    address: cleanAddress,
    folio,
    yearBuilt,
    latestRoofYear,
    roofYear,
    roofAge: scoreData.age,
    score: scoreData.score,
    label: scoreData.label,
    color: scoreData.color,
    sourceNote: latestRoofYear ? 'Permiso de techo reciente encontrado' : yearBuilt ? `Sin permiso reciente — usando año construcción (${yearBuilt})` : 'Sin datos disponibles',
    permits: allPermits.filter(p => p.isRoof),
    allPermits,
    debug: {
      paRawType: typeof paData,
      paError: paData?.error || null,
      paInfo,
      folio,
      yearBuilt,
      recentPermitsCount: recentPermits.length,
      roofPermitsCount: roofPermits.length,
    }
  };
}

module.exports = { scrapeMiamiDade };
