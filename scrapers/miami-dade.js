const axios = require('axios');
const config = require('../config');

const ROOF_CATS = new Set(['0092','0082','0107','0083','0084','0085','0086','0087','0088','0089','0090','0091','0093','0094','0095']);
const ROOF_KEYWORDS = ['ROOF','SHINGLE','TILE','FLAT','SBS','SINGLE PLY','GRAVEL','METAL ROOF','WOOD SHAKE'];

function isRoof(cat, desc) {
  if (ROOF_CATS.has(String(cat))) return true;
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

// MyHome property search — primero obtenemos el FOLIO por dirección
const MYHOME_SEARCH = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/24/query';
// Layer 24 = "Property @ PaGis" del mismo MapServer

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();
  const parts = cleanAddress.match(/^(\d+)\s+(.+)$/);
  const streetNum = parts?.[1] || '';
  const streetRest = parts?.[2] || '';

  // Paso 1: buscar FOLIO por dirección en el layer de propiedades
  const propRes = await axios.get(MYHOME_SEARCH, {
    params: {
      where: `ADDRESS LIKE '${cleanAddress}%'`,
      outFields: 'FOLIO,ADDRESS,OWNER1',
      resultRecordCount: 5,
      f: 'json'
    },
    timeout: 15000
  }).catch(e => ({ data: { error: e.message } }));

  const propFeatures = propRes.data?.features || [];
  const folio = propFeatures[0]?.attributes?.FOLIO || null;

  // Paso 2: si tenemos folio, buscar todos los permisos por FOLIO en el layer de permisos
  let permitsByFolio = [];
  if (folio) {
    const permRes = await axios.get(
      'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1/query',
      {
        params: {
          where: `FOLIO = '${folio}'`,
          outFields: 'ADDRESS,FOLIO,TYPE,CAT1,DESC1,ISSUDATE,BLDCMPDT,BPSTATUS',
          resultRecordCount: 200,
          orderByFields: 'ISSUDATE DESC',
          f: 'json'
        },
        timeout: 15000
      }
    ).catch(e => ({ data: { error: e.message } }));
    permitsByFolio = permRes.data?.features?.map(f => f.attributes) || [];
  }

  return {
    county: 'miami-dade',
    roofAge: null, score: 'NO_DATA', label: 'SIN DATA', color: 'purple',
    latestRoofYear: null, permits: [], allPermits: [],
    debug: {
      cleanAddress,
      propError: propRes.data?.error || null,
      propFound: propFeatures.length,
      propSample: propFeatures[0]?.attributes || null,
      folio,
      permitsByFolioCount: permitsByFolio.length,
      permitsSample: permitsByFolio.slice(0, 3),
    }
  };
}

module.exports = { scrapeMiamiDade };
