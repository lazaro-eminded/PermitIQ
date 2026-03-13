/**
 * integrations/ghl.js
 * GoHighLevel API integration â€” push permit + PA data to contact custom fields.
 */

const config = require(''../config'');

const BASE_URL = config.GHL_BASE_URL;
const API_KEY  = config.GHL_API_KEY;
const LOC_ID   = config.GHL_LOCATION_ID;

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  ''Content-Type'': ''application/json'',
  Version: ''2021-07-28'',
};

/**
 * searchContactByPhone(phone)
 * Returns the first matching contact or null.
 */
async function searchContactByPhone(phone) {
  const clean = phone.replace(/\D/g, '''');
  const url = `${BASE_URL}/contacts/search?locationId=${LOC_ID}&phone=${encodeURIComponent(clean)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const data = await res.json();
  const contacts = data.contacts || [];
  return contacts.length > 0 ? contacts[0] : null;
}

/**
 * searchContactByEmail(email)
 */
async function searchContactByEmail(email) {
  const url = `${BASE_URL}/contacts/search?locationId=${LOC_ID}&email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const data = await res.json();
  const contacts = data.contacts || [];
  return contacts.length > 0 ? contacts[0] : null;
}

/**
 * pushPermitData(contactId, payload)
 * Updates a GHL contact''s custom fields with permit + PA data.
 *
 * @param {string} contactId
 * @param {Object} payload
 *   - property: { ownerName, yearBuilt, sqft, assessedValue, homestead, ownerMailing }
 *   - permits:  Array of permit objects
 *   - roofScore: { score, age, date, contractor, permitNumber }
 *   - summary:  { county, totalFound, querySource }
 */
async function pushPermitData(contactId, payload) {
  const { property = {}, roofScore = {}, permits = [], summary = {} } = payload;

  // â”€â”€ Build custom fields array â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const customFields = [];

  const addField = (key, value) => {
    if (value !== null && value !== undefined && value !== '''') {
      customFields.push({ key, field_value: String(value) });
    }
  };

  // Roof scoring
  addField(''permit_roof_score'',         roofScore.label   || '''');
  addField(''permit_roof_age'',           roofScore.age !== null ? `${roofScore.age} aÃ±os` : '''');
  addField(''permit_roof_date'',          roofScore.date    || '''');
  addField(''permit_roof_contractor'',    roofScore.contractor || '''');
  addField(''permit_roof_permit_number'', roofScore.permitNumber || '''');

  // Most recent AC + electrical (first occurrence from permits)
  const acPerm  = permits.find(p => p._category === ''ac'');
  const elPerm  = permits.find(p => p._category === ''electric'');

  if (acPerm) {
    addField(''permit_ac_age'',        acPerm._age !== null ? `${acPerm._age} aÃ±os` : '''');
    addField(''permit_ac_date'',       acPerm.date   || '''');
    addField(''permit_ac_contractor'', acPerm.contractor || '''');
    addField(''permit_ac_permit_number'', acPerm.permitNumber || '''');
  }

  if (elPerm) {
    addField(''permit_electric_age'',        elPerm._age !== null ? `${elPerm._age} aÃ±os` : '''');
    addField(''permit_electric_date'',       elPerm.date   || '''');
    addField(''permit_electric_contractor'', elPerm.contractor || '''');
    addField(''permit_electric_permit_number'', elPerm.permitNumber || '''');
  }

  // County + meta
  addField(''permit_county'',       summary.county       || '''');
  addField(''permit_total_found'',  summary.totalFound   || 0);
  addField(''permit_last_checked'', new Date().toISOString().slice(0, 10));
  addField(''permit_query_source'', summary.querySource  || '''');

  // Property appraiser fields
  addField(''pa_homestead'',       property.homestead ? ''SÃ­'' : ''No'');
  addField(''pa_owner_name'',      property.ownerName || '''');
  addField(''pa_year_built'',      property.yearBuilt || '''');
  addField(''pa_sqft'',            property.sqft      || '''');
  addField(''pa_assessed_value'',  property.assessedValue ? `$${Number(property.assessedValue).toLocaleString()}` : '''');
  addField(''pa_owner_mailing'',   property.ownerMailing  || '''');

  // â”€â”€ PATCH contact â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const url = `${BASE_URL}/contacts/${contactId}`;
  const body = JSON.stringify({ customFields });

  const res = await fetch(url, { method: ''PUT'', headers: HEADERS, body });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GHL update failed (${res.status}): ${err}`);
  }
  return await res.json();
}

/**
 * getContact(contactId)
 */
async function getContact(contactId) {
  const url = `${BASE_URL}/contacts/${contactId}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`GHL getContact failed: ${res.status}`);
  return await res.json();
}

module.exports = { searchContactByPhone, searchContactByEmail, pushPermitData, getContact };

