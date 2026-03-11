const axios = require('axios');
const config = require('../config');

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= config.ROOF_SCORE.CRITICAL_YEARS) return { score: 'CRITICAL', label: 'CRITICO — Hot Lead', color: 'red', age };
  if (age >= config.ROOF_SCORE.WARM_YEARS)     return { score: 'WARM',     label: 'ATENCION — Warm',   color: 'yellow', age };
  return { score: 'OK', label: 'OK — Cold', color: 'green', age };
}

// URLs del ArcGIS REST API de Miami-Dade (probar en orden)
const ARCGIS_ENDPOINTS = [
  'https://gisweb.miamidade.gov/arcgis/rest/services/RER/BuildingPermit/MapServer/0/query',
  'https://gisweb.miamidade.gov/arcgis/rest/services/RER/MD_BuildingPermit/MapServer/0/query',
  'https://gisweb.miamidade.gov/arcgis/rest/services/LandManagement/BuildingPermit/MapServer/0/query',
  'https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/BuildingPermit/FeatureServer/0/query',
];

async function queryArcGIS(endpoint, addressLike) {
  const params = {
    where: `SITE_ADDRESS LIKE '${addressLike}%'`,
    outFields: '*',
    orderByFields: 'ISSUE_DATE DESC',
    resultRecordCount: 50,
    f: 'json',
  };
  const res = await axios.get(endpoint, { params, timeout: 15000 });
  if (res.data && res.data.features) return res.data.features;
  return null;
}

async function scrapeMiamiDade(address) {
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();
  // Usar solo numero y calle para el LIKE
  const addressLike = cleanAddress.replace(/\s+/g, ' ').split(' ').slice(0, 3).join(' ');

  let features = null;
  let workingEndpoint = null;
  const errors = [];

  // Probar cada endpoint hasta que uno funcione
  for (const endpoint of ARCGIS_ENDPOINTS) {
    try {
      features = await queryArcGIS(endpoint, addressLike);
      if (features !== null) {
        workingEndpoint = endpoint;
        break;
      }
    } catch(e) {
      errors.push({ endpoint, error: e.message });
    }
  }

  // Buscar permisos de techo en los resultados
  let latestYear = null;
  const roofPermits = [];

  if (features && features.length > 0) {
    for (const f of features) {
      const attrs = f.attributes || {};
      const permitType = (attrs.PERMIT_TYPE || attrs.TYPE || attrs.WORK_TYPE || '').toString();
      const desc = (attrs.DESCRIPTION || attrs.DESC_ || attrs.WORK_DESC || '').toString();
      const isRoof = /roof|roofing/i.test(permitType) || /roof|roofing/i.test(desc);

      if (isRoof) {
        // Extraer año de la fecha de emisión
        const dateFields = ['ISSUE_DATE', 'ISSUED_DATE', 'DATE_ISSUED', 'PERMIT_DATE'];
        for (const field of dateFields) {
          if (attrs[field]) {
            // ArcGIS timestamps son milisegundos desde epoch
            const ts = parseInt(attrs[field]);
            const yr = ts > 9999999999 ? new Date(ts).getFullYear() : new Date(ts * 1000).getFullYear();
            if (yr >= 1990 && yr <= new Date().getFullYear()) {
              if (!latestYear || yr > latestYear) latestYear = yr;
              roofPermits.push({
                raw: `${permitType} - ${desc}`.trim(),
                type: permitType || 'ROOFING',
                date: String(yr),
              });
              break;
            }
          }
        }
      }
    }
  }

  const scoring = calcScore(latestYear);

  return {
    county: 'miami-dade',
    roofAge: scoring.age,
    score: scoring.score,
    label: scoring.label,
    color: scoring.color,
    latestRoofYear: latestYear,
    permits: roofPermits,
    allPermits: features ? features.slice(0, 10).map(f => JSON.stringify(f.attributes).slice(0, 100)) : [],
    debug: {
      addressLike,
      workingEndpoint,
      totalFeatures: features ? features.length : 0,
      roofFeatures: roofPermits.length,
      errors,
      sampleFeature: features && features[0] ? features[0].attributes : null,
    }
  };
}

module.exports = { scrapeMiamiDade };
