const axios = require('axios');
const config = require('../config');

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= config.ROOF_SCORE.CRITICAL_YEARS) return { score: 'CRITICAL', label: 'CRITICO — Hot Lead', color: 'red', age };
  if (age >= config.ROOF_SCORE.WARM_YEARS)     return { score: 'WARM',     label: 'ATENCION — Warm',   color: 'yellow', age };
  return { score: 'OK', label: 'OK — Cold', color: 'green', age };
}

const PERMIT_LAYER = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1/query';

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();
  const parts = cleanAddress.match(/^(\d+)\s+(.+)$/);
  const streetNum = parts ? parts[1] : '';

  // Ver 5 registros al azar para entender el formato del campo ADDRESS
  const sampleRes = await axios.get(PERMIT_LAYER, {
    params: {
      where: `ADDRESS LIKE '${streetNum}%'`,
      outFields: 'ADDRESS,TYPE,CAT1,DESC1,ISSUDATE,BLDCMPDT,BPSTATUS',
      resultRecordCount: 5,
      f: 'json'
    },
    timeout: 15000
  });

  // También probar con solo el número de calle para ver formato
  const sampleRes2 = await axios.get(PERMIT_LAYER, {
    params: {
      where: `OBJECTID < 10`,
      outFields: 'ADDRESS,TYPE,CAT1,DESC1,ISSUDATE,BLDCMPDT,FOLIO',
      resultRecordCount: 5,
      f: 'json'
    },
    timeout: 15000
  });

  return {
    county: 'miami-dade',
    roofAge: null, score: 'NO_DATA', label: 'SIN DATA', color: 'purple',
    latestRoofYear: null, permits: [], allPermits: [],
    debug: {
      cleanAddress,
      byStreetNum: sampleRes.data.features?.map(f => f.attributes) || sampleRes.data.error,
      randomSample: sampleRes2.data.features?.map(f => f.attributes) || sampleRes2.data.error,
    }
  };
}

module.exports = { scrapeMiamiDade };
