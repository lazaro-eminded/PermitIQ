/**
 * routes/bulk-upload.js
 * POST /api/bulk-upload
 *
 * Accepts a JSON array of contacts:
 * [{ address, city, zip, contactId, folio? }, ...]
 *
 * Processes them sequentially (with delay) and pushes results to GHL.
 * Returns a summary of successes / failures.
 */

const { detectCounty }    = require(''../utils/detect-county'');
const { scrapeMiamiDade }  = require(''../scrapers/miami-dade'');
const { scrapeBroward }    = require(''../scrapers/broward'');
const ghl                 = require(''../integrations/ghl'');

const DELAY_MS = 1500; // throttle to avoid rate limits

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = async function bulkUpload(req, res) {
  const rows = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: ''EnvÃ­a un array JSON de contactos.'' });
  }

  const results = [];

  for (const row of rows) {
    const { address, city, zip, contactId, folio } = row;
    if (!address) {
      results.push({ address, status: ''error'', error: ''Missing address'' });
      continue;
    }
    try {
      const county = detectCounty(zip, city);
      let result;
      if (!county || county === ''miami-dade'') {
        result = await scrapeMiamiDade({ address, folio });
      } else if (county === ''broward'') {
        result = await scrapeBroward({ address, folio });
      } else {
        results.push({ address, status: ''skipped'', reason: `County not supported: ${county}` });
        continue;
      }
      if (contactId) {
        await ghl.pushPermitData(contactId, result);
      }
      results.push({
        address,
        contactId,
        status:    ''ok'',
        roofScore: result.roofScore?.label,
        permits:   result.summary?.totalFound,
      });
    } catch (err) {
      results.push({ address, contactId, status: ''error'', error: err.message });
    }
    await sleep(DELAY_MS);
  }

  return res.json({ processed: results.length, results });
};

