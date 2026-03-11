const axios = require('axios');
const config = require('../config');

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();
  const parts = cleanAddress.match(/^(\d+)\s+(.+)$/);
  const streetNum = parts?.[1] || '';

  // Opción 1: MapServer Find — busca texto en layers específicos
  const findRes = await axios.get(
    'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/find',
    {
      params: {
        searchText: cleanAddress,
        layers: '1,24,26',   // BuildingPermit, Property, Parcels
        searchFields: 'ADDRESS',
        returnGeometry: false,
        f: 'json'
      },
      timeout: 15000
    }
  ).catch(e => ({ data: { error: e.message } }));

  // Opción 2: Address Search API de Miami-Dade (usada por MyHome)
  const addrRes = await axios.get(
    'https://gisweb.miamidade.gov/addresssearch/addresssearch.aspx',
    {
      params: { m: 'findaddress', addr: cleanAddress, f: 'json' },
      timeout: 15000
    }
  ).catch(e => ({ data: { error: e.message } }));

  // Opción 3: el endpoint que usa el portal ePermitting internamente
  const epRes = await axios.get(
    'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1/query',
    {
      params: {
        where: `ADDRESS LIKE '${streetNum} NW%' OR ADDRESS LIKE '${streetNum} NE%' OR ADDRESS LIKE '${streetNum} SW%' OR ADDRESS LIKE '${streetNum} SE%'`,
        outFields: 'ADDRESS,FOLIO,TYPE,CAT1,DESC1,ISSUDATE',
        resultRecordCount: 10,
        f: 'json'
      },
      timeout: 15000
    }
  ).catch(e => ({ data: { error: e.message } }));

  return {
    county: 'miami-dade',
    roofAge: null, score: 'NO_DATA', label: 'SIN DATA', color: 'purple',
    latestRoofYear: null, permits: [], allPermits: [],
    debug: {
      cleanAddress,
      find: {
        error: findRes.data?.error || null,
        count: findRes.data?.results?.length ?? 0,
        sample: findRes.data?.results?.slice(0,2) || null,
      },
      addrSearch: {
        type: typeof addrRes.data,
        isArray: Array.isArray(addrRes.data),
        snippet: JSON.stringify(addrRes.data).slice(0, 200),
      },
      epQuery: {
        error: epRes.data?.error || null,
        count: epRes.data?.features?.length ?? 0,
        sample: epRes.data?.features?.slice(0,2)?.map(f=>f.attributes) || null,
      }
    }
  };
}

module.exports = { scrapeMiamiDade };
