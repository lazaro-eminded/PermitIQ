const axios = require('axios');
const config = require('../config');

const PA_BASE    = 'https://apps.miamidadepa.gov/PApublicServiceProxy/PaServicesProxy.ashx';
const PA_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://apps.miamidadepa.gov/PropertySearch/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
};

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

  // PASO 1: GetAddress
  let addrData = null, addrError = null;
  try {
    const r = await axios.get(PA_BASE, {
      params: { Operation: 'GetAddress', clientAppName: 'PropertySearch', myUnit: '', from: 1, to: 200, myAddress: cleanAddress },
      headers: PA_HEADERS, timeout: 20000
    });
    addrData = r.data;
  } catch(e) { addrError = e.message; }

  const list = addrData?.MinimumPropertyInfos || [];
  const match = list[0] || null;
  const strap = match?.Strap || null;
  const folio = strap ? strap.replace(/-/g, '') : null;

  // PASO 2: GetPropertySearchByFolio
  let paData = null, paError = null;
  if (folio) {
    try {
      const r = await axios.get(PA_BASE, {
        params: { Operation: 'GetPropertySearchByFolio', clientAppName: 'PropertySearch', folioNumber: folio },
        headers: PA_HEADERS, timeout: 20000
      });
      paData = r.data;
    } catch(e) { paError = e.message; }
  }

  return {
    county: 'miami-dade',
    score: 'NO_DATA', label: 'SIN DATA', color: 'purple',
    roofAge: null, latestRoofYear: null, permits: [], allPermits: [],
    debug: {
      cleanAddress,
      addrError,
      listCount: list.length,
      strap,
      folio,
      paError,
      paOwner: paData?.OwnerInfos?.[0]?.Name || null,
      paYearBuilt: paData?.Building?.BuildingInfos?.[0]?.Actual || null,
      paAssessed: paData?.Assessment?.AssessmentInfos?.[0]?.AssessedValue || null,
    }
  };
}

module.exports = { scrapeMiamiDade };
