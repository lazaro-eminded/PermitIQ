/**
 * routes/debug.js
 */

const PA_BASE  = 'https://apps.miamidadepa.gov/PApublicServiceProxy/PaServicesProxy.ashx';
const FTL_BASE = 'https://gis.fortlauderdale.gov/arcgis/rest/services/BuildingPermitTracker/BuildingPermitTracker/MapServer/0/query';
const BROWARD_PARCELS = 'https://gis.broward.org/arcgis/rest/services/RegionalGIS/BCParcelData/MapServer/0/query';

async function paSearch(addr) {
  const url = `${PA_BASE}?Operation=GetAddress&clientAppName=PropertySearch&myUnit=&from=1&to=10&myAddress=${encodeURIComponent(addr)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
  const d = await r.json();
  return { query: addr, count: (d.MinimumPropertyInfos||[]).length, first: (d.MinimumPropertyInfos||[])[0] || null };
}

module.exports = async function debug(req, res) {
  const type = req.params.type;
  const q    = req.query;

  try {
    if (type === 'pa-multi') {
      const variants = [
        '11900 SW 97 Ave',
        '11900 SW 97TH AVE',
        '11900 SW 97TH',
        '11900 SW 97',
        '11900 SW',
        '11900',
      ];
      const results = await Promise.all(variants.map(v => paSearch(v)));
      return res.json(results);
    }

    if (type === 'pa') {
      const addr = q.address || '1234 NW 7 St';
      const url = `${PA_BASE}?Operation=GetAddress&clientAppName=PropertySearch&myUnit=&from=1&to=10&myAddress=${encodeURIComponent(addr)}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
      const raw = await r.json();
      const hits = raw.MinimumPropertyInfos || [];
      return res.json({ query: addr, httpStatus: r.status, hitCount: hits.length, first3: hits.slice(0,3), rawKeys: Object.keys(raw) });
    }

    if (type === 'pa-folio') {
      const folio = q.folio || '3017630020010';
      const url   = `${PA_BASE}?Operation=GetPropertySearchByFolio&clientAppName=PropertySearch&folioNumber=${folio}`;
      const r     = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
      const data  = await r.json();
      return res.json({
        topKeys:           Object.keys(data),
        PropertyInfo:      data.PropertyInfo || 'MISSING',
        OwnerInfos_0:      (data.OwnerInfos||[])[0] || 'MISSING',
        BuildingInfo_0:    (data.BuildingInfo || data.BuildingInfos||[])[0] || 'MISSING',
        AssessmentInfos_0: (data.AssessmentInfos||[])[0] || 'MISSING',
      });
    }

    if (type === 'broward-gis') {
      const addr   = (q.address || '100 N ANDREWS AVE').toUpperCase();
      const prefix = addr.substring(0, 20);
      const params = new URLSearchParams({
        where: `UPPER(SITEADDR) LIKE '${prefix}%'`,
        outFields: 'FOLIO,SITEADDR,OWNER,YEARBUILT,LIVINGAREA,JUSTVALUE,HOMESTEAD',
        returnGeometry: 'false', resultRecordCount: '5', f: 'json',
      });
      const url = `${BROWARD_PARCELS}?${params}`;
      const r   = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
      const d   = await r.json();
      return res.json({ url, httpStatus: r.status, featureCount: (d.features||[]).length, error: d.error||null, sample: (d.features||[]).slice(0,3).map(f=>f.attributes) });
    }

    if (type === 'broward-gis2') {
      const zip    = q.zip || '33301';
      const params = new URLSearchParams({
        where: `ZIP='${zip}'`,
        outFields: '*',
        returnGeometry: 'false', resultRecordCount: '3', f: 'json',
      });
      const url = `${BROWARD_PARCELS}?${params}`;
      const r   = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
      const d   = await r.json();
      return res.json({ url, httpStatus: r.status, featureCount: (d.features||[]).length, error: d.error||null, sample: (d.features||[]).slice(0,3).map(f=>f.attributes) });
    }

    if (type === 'ftl-addr') {
      const addr   = (q.address || '100 N ANDREWS').toUpperCase();
      const params = new URLSearchParams({
        where: `UPPER(FULLADDR) LIKE '${addr.substring(0,20)}%'`,
        outFields: 'PERMITID,PARCELID,FULLADDR,PERMITTYPE,APPROVEDT,CONTRACTOR',
        resultRecordCount: '5', f: 'json',
      });
      const url = `${FTL_BASE}?${params}`;
      const r   = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
      const d   = await r.json();
      return res.json({ url, httpStatus: r.status, featureCount: (d.features||[]).length, error: d.error||null, sample: (d.features||[]).slice(0,5).map(f=>f.attributes) });
    }

    if (type === 'ftl') {
      const parcel = q.parcel || '5042312201100';
      const params = new URLSearchParams({ where: `PARCELID='${parcel}'`, outFields: '*', resultRecordCount: '5', f: 'json' });
      const url    = `${FTL_BASE}?${params}`;
      const r      = await fetch(url, { headers: { 'User-Agent': 'PermitIQ/1.0' } });
      const d      = await r.json();
      return res.json({ url, httpStatus: r.status, featureCount: (d.features||[]).length, error: d.error||null, sample: (d.features||[]).slice(0,3).map(f=>f.attributes) });
    }

    return res.json({ available: ['pa', 'pa-multi', 'pa-folio', 'broward-gis', 'broward-gis2', 'ftl', 'ftl-addr'] });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
