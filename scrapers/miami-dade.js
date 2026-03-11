const axios = require('axios');
const config = require('../config');

// Categorías de techo confirmadas del layer
const ROOF_CATS = new Set(['0082','0083','0084','0085','0086','0087','0088','0089','0090','0091','0092','0093','0094','0095','0107']);
const ROOF_KEYWORDS = ['ROOF','SHINGLE','TILE','FLAT','SBS','SINGLE PLY','GRAVEL','METAL ROOF','WOOD SHAKE','ASPHALT'];

function isRoof(cat, desc) {
  if (ROOF_CATS.has(String(cat || '').trim())) return true;
  if (desc && ROOF_KEYWORDS.some(k => String(desc).toUpperCase().includes(k))) return true;
  return false;
}

function calcScore(year) {
  if (!year) return { score: 'NO_DATA', label: 'SIN DATA', color: 'purple', age: null };
  const age = new Date().getFullYear() - year;
  if (age >= config.ROOF_SCORE.CRITICAL_YEARS) return { score: 'CRITICAL', label: 'CRITICO — Hot Lead', color: 'red', age };
  if (age >= config.ROOF_SCORE.WARM_YEARS)     return { score: 'WARM',     label: 'ATENCION — Warm',   color: 'yellow', age };
  return { score: 'OK', label: 'OK — Cold', color: 'green', age };
}

const PERMIT_URL = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/1/query';

async function scrapeMiamiDade(address) {
  // Limpiar dirección — quitar ciudad/estado, mayúsculas
  const cleanAddress = address.replace(/,.*$/, '').trim().toUpperCase();

  // Extraer número de calle para búsqueda más flexible
  const streetNum = cleanAddress.match(/^(\d+)/)?.[1] || '';
  if (!streetNum) {
    return { county: 'miami-dade', score: 'NO_DATA', label: 'SIN DATA', color: 'purple',
             roofAge: null, latestRoofYear: null, permits: [], allPermits: [],
             error: 'No se pudo extraer número de calle' };
  }

  // Query: número exacto + comienzo de dirección (LIKE ignora trailing spaces)
  const res = await axios.get(PERMIT_URL, {
    params: {
      where: `ADDRESS LIKE '${cleanAddress}%'`,
      outFields: 'ADDRESS,FOLIO,TYPE,CAT1,DESC1,ISSUDATE,BPSTATUS',
      resultRecordCount: 200,
      orderByFields: 'ISSUDATE DESC',
      f: 'json'
    },
    timeout: 20000
  });

  const features = res.data?.features || [];

  // Si no hay resultados, intentar con solo el número (por si el formato difiere levemente)
  let allPermits = features.map(f => f.attributes);
  if (allPermits.length === 0) {
    const res2 = await axios.get(PERMIT_URL, {
      params: {
        where: `ADDRESS LIKE '${streetNum} %'`,
        outFields: 'ADDRESS,FOLIO,TYPE,CAT1,DESC1,ISSUDATE,BPSTATUS',
        resultRecordCount: 50,
        orderByFields: 'ISSUDATE DESC',
        f: 'json'
      },
      timeout: 20000
    });
    // Filtrar manualmente solo los que coincidan con nuestra dirección
    const all = res2.data?.features?.map(f => f.attributes) || [];
    const normalized = cleanAddress.replace(/\s+/g, ' ');
    allPermits = all.filter(p => {
      const addr = (p.ADDRESS || '').trim().replace(/\s+/g, ' ');
      return addr === normalized;
    });
  }

  // Separar permisos de techo
  const roofPermits = allPermits.filter(p => isRoof(p.CAT1, p.DESC1));

  // Año del último permiso de techo
  let latestRoofYear = null;
  if (roofPermits.length > 0 && roofPermits[0].ISSUDATE) {
    latestRoofYear = new Date(roofPermits[0].ISSUDATE).getFullYear();
  }

  const scoreData = calcScore(latestRoofYear);

  // Formatear todos los permisos para el UI
  const formattedPermits = allPermits.map(p => ({
    date: p.ISSUDATE ? new Date(p.ISSUDATE).toLocaleDateString('en-US') : 'N/A',
    type: p.TYPE?.trim() || '',
    description: (p.DESC1 || '').trim(),
    status: p.BPSTATUS?.trim() || '',
    folio: p.FOLIO?.trim() || '',
    isRoof: isRoof(p.CAT1, p.DESC1)
  }));

  return {
    county: 'miami-dade',
    address: cleanAddress,
    folio: allPermits[0]?.FOLIO?.trim() || null,
    latestRoofYear,
    roofAge: scoreData.age,
    score: scoreData.score,
    label: scoreData.label,
    color: scoreData.color,
    sourceNote: latestRoofYear
      ? `Último permiso de techo: ${latestRoofYear}`
      : allPermits.length > 0
        ? `${allPermits.length} permisos encontrados — sin permiso de techo reciente (últimos 3 años)`
        : 'Sin permisos en los últimos 3 años',
    permits: formattedPermits.filter(p => p.isRoof),
    allPermits: formattedPermits
  };
}

module.exports = { scrapeMiamiDade };
