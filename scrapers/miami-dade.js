const axios = require('axios');
const config = require('../config');

const SOCRATA_URL = 'https://opendata.miamidade.gov/resource/ajuk-cyx7.json';

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

  const res = await axios.get(SOCRATA_URL, {
    params: {
      '$where': `address like '${cleanAddress}%'`,
      '$limit': 5,
      '$order': 'issudate DESC',
    },
    timeout: 20000
  });

  const data = res.data;
  const first = data[0] || {};

  return {
    county: 'miami-dade',
    roofAge: null, score: 'NO_DATA', label: 'SIN DATA', color: 'purple',
    latestRoofYear: null, permits: [], allPermits: [],
    debug: {
      totalFound: data.length,
      fields: Object.keys(first),
      record0: first,
      record1: data[1] || null,
    }
  };
}

module.exports = { scrapeMiamiDade };
