/**
 * routes/ghl-webhook.js
 * POST /api/webhook/ghl
 *
 * GHL sends a webhook when a contact is created/updated with address data.
 * We auto-run the permit search and push results back.
 *
 * Expected payload (GHL Custom Webhook):
 * { contactId, address1, city, state, postalCode, phone, email }
 */

const { detectCounty }    = require('../utils/detect-county');
const { scrapeMiamiDade }  = require('../scrapers/miami-dade');
const { scrapeBroward }    = require('../scrapers/broward');
const ghl                 = require('../integrations/ghl');

module.exports = async function ghlWebhook(req, res) {
  const body = req.body || {};

  const {
    contactId,
    address1,      // street address
    city,
    state,
    postalCode,    // ZIP
    customData,    // may contain folio
  } = body;

  // Acknowledge immediately so GHL doesn't time out
  res.json({ received: true });

  if (!address1 && !contactId) {
    console.warn('[Webhook] Missing address1 and contactId — skipping.');
    return;
  }

  try {
    const folio  = customData?.folio || null;
    const county = detectCounty(postalCode, city);

    let result;
    if (!county || county === 'miami-dade') {
      result = await scrapeMiamiDade({ address: address1, folio });
    } else if (county === 'broward') {
      result = await scrapeBroward({ address: address1, folio });
    } else {
      console.warn(`[Webhook] Unsupported county: ${county}`);
      return;
    }

    if (contactId) {
      await ghl.pushPermitData(contactId, result);
      console.log(`[Webhook] Pushed to GHL contact ${contactId}`, result.roofScore);
    }
  } catch (err) {
    console.error('[Webhook Error]', err.message);
  }
};
