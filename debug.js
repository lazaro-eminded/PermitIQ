/**
 * routes/debug.js — diagnostico temporal
 * GET /api/debug/pa?address=11900+SW+97+Ave
 * GET /api/debug/pa-folio?folio=3017630020010
 * GET /api/debug/fdot?address=100+N+ANDREWS+AVE
 * GET /api/debug/fdot-zip?zip=33301
 * GET /api/debug/ftl?parcel=5042312201100
 */

const PA_BASE   = 'https://apps.miamidadepa.gov/PApublicServiceProxy/PaServicesProxy.ashx';
const FDOT_BASE = 'https://gis.fdot.gov/arcgis/rest/services/Parcels/FeatureServer/6/query';
const FTL_BASE  = 'https://gis.fortlauderdale.gov/arcgis/rest/services/BuildingPermitTracker/BuildingPermitTracker/MapServer/0/query';

function fdotUrl(where) {
  const qs = new URLSearchParams({
    outFields: 'PARCEL_ID,OWN_NAME,PHY_ADDR1,PHY_CITY,ACT_YR_BLT,TOT_LVG_AR,JV,JV_HMSTD',
    returnGeometry: 'false', resultRecordCount: '5', f: 'json',
  }).toString();
  return `${FDOT_BASE}?where=${encodeURIComponent(where)}&${qs}`;
}

module.exports = async function debug(req, res) {
  const type = req.params.type;
  const q    = req.query;
  try {
    if (type === 'pa') {
      const addr = q.address || '11900 SW 97 Ave';
      const url  = `${PA_BASE}?Operation=GetAddress&clientAppName=PropertySearch&myUnit=&from=1&to=10&myAddress=${encodeURIComponent(addr)}`;
      const r    = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
      const data = await r.json();
      const hits = data.MinimumPropertyInfos || data.Hits || data.Results || [];
      return res.json({ url, httpStatus: r.status, topKeys: Object.keys(data), hitCount: hits.length, first3: hits.slice(0,3) });
    }

    if (type === 'pa-folio') {
      const folio = q.folio || '3017630020010';
      const url   = `${PA_BASE}?Operation=GetPropertySearchByFolio&clientAppName=PropertySearch&folioNumber=${folio}`;
      const r     = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
      const data  = await r.json();
      return res.json({
        url, httpStatus: r.status,
        topKeys: Object.keys(data),
        PropertyInfo:          data.PropertyInfo          || 'MISSING',
        OwnerInfos_0:          (data.OwnerInfos || [])[0] || 'MISSING',
        BuildingInfo_0:        (data.BuildingInfo || data.BuildingInfos || [])[0] || 'MISSING',
        AssessmentInfos_0:     (data.AssessmentInfos || [])[0] || 'MISSING',
      });
    }

    if (type === 'fdot') {
      const addr   = (q.address || '100 N ANDREWS AVE').toUpperCase();
      const prefix = addr.substring(0, 25);
      const url    = fdotUrl(`UPPER(PHY_ADDR1) LIKE '${prefix}%'`);
      const r      = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
      const data   = await r.json();
      return res.json({ url, httpStatus: r.status, featureCount: (data.features||[]).length, error: data.error||null, sample: (data.features||[]).slice(0,3).map(f=>f.attributes) });
    }

    if (type === 'fdot-zip') {
      const zip  = q.zip || '33301';
      const url  = fdotUrl(`PHY_ZIPCD=${zip}`);
      const r    = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
      const data = await r.json();
      return res.json({ url, httpStatus: r.status, featureCount: (data.features||[]).length, error: data.error||null, sample: (data.features||[]).slice(0,3).map(f=>f.attributes) });
    }

    if (type === 'ftl') {
      const parcel = q.parcel || '5042312201100';
      const params = new URLSearchParams({ where: `PARCELID='${parcel}'`, outFields: '*', resultRecordCount: '5', f: 'json' });
      const url    = `${FTL_BASE}?${params}`;
      const r      = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
      const data   = await r.json();
      return res.json({ url, httpStatus: r.status, featureCount: (data.features||[]).length, error: data.error||null, sample: (data.features||[]).slice(0,3).map(f=>f.attributes) });
    }

    return res.json({ available: ['pa', 'pa-folio', 'fdot', 'fdot-zip', 'ftl'] });
  } catch(e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
};
