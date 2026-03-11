const axios = require('axios');
const config = require('../config');

const ROOF_CATS = ['0092','0082','0107','0083','0084','0085','0086','0087','0088','0089','0090','0091'];
// 0092=Flat/SBS, 0107=Tile, 0082=Windows (not roof but let's see), 0083-0091=roof types

const ROOF_DESCS = ['ROOF','SHINGLE','TILE','FLAT','SBS','SINGLE PLY','GRAVEL'];

function isRoof(cat, desc) {
  if (ROOF_CATS.includes(cat)) return true;
  if (desc && ROOF_DESCS.some(r => desc.toUpperCase().includes(r))) return true;
  return false;
}

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= config.ROOF_SCORE.CRITICAL_YEARS) return { score: 'CRITICAL', label: 'CRITICO — Hot Lead', color: 'red', age };
  if (age >= config.ROOF_SCORE.WARM_YEARS)     return { score: 'WARM',     label: 'ATENCION — Warm',   color: 'yellow', age };
  return { score: 'OK', label: 'OK — Cold', color: 'green', age };
}

// Socrata OpenData — dataset histórico completo de Miami-Dade
const SOCRATA_URL = 'https://opendata.miamidade.gov/resource/ajuk-cyx7.json';

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();
  const parts = cleanAddress.match(/^(\d+)\s+(.+)$/);
  const streetNum = parts?.[1] || '';
  const streetRest = parts?.[2] || '';

  try {
    const res = await axios.get(SOCRATA_URL, {
      params: {
        $where: `address like '${cleanAddress}%'`,
        $limit: 100,
        $order: 'issudate DESC',
      },
      timeout: 20000
    });

    const data = res.data;

    return {
      county: 'miami-dade',
      roofAge: null, score: 'NO_DATA', label: 'SIN DATA', color: 'purple',
      debug: {
        cleanAddress,
        socrataCount: data.length,
        socrataError: data.error || null,
        sample: data.slice(0, 3),
        allFields: data[0] ? Object.keys(data[0]) : []
      }
    };
  } catch(e) {
    return {
      county: 'miami-dade',
      roofAge: null, score: 'NO_DATA', label: 'SIN DATA', color: 'purple',
      debug: { cleanAddress, error: e.message }
    };
  }
}

module.exports = { scrapeMiamiDade };
