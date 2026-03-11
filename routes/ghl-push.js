const express = require('express');
const axios   = require('axios');
const router  = express.Router();
const config  = require('../config');

const GHL_BASE    = 'https://services.leadconnectorhq.com';
const GHL_HEADERS = {
  'Authorization': `Bearer ${config.GHL_API_KEY}`,
  'Version': '2021-07-28',
  'Content-Type': 'application/json'
};

// Mapeo de campos PermitIQ → GHL custom field keys
// Los keys son exactamente los nombres de los campos en GHL
function buildCustomFields(ghlFields) {
  const fieldMap = {
    permit_roof_score:             ghlFields.permit_roof_score,
    permit_roof_age:               ghlFields.permit_roof_age,
    permit_roof_date:              formatDate(ghlFields.permit_roof_date),
    permit_roof_contractor:        ghlFields.permit_roof_contractor,
    permit_roof_permit_number:     ghlFields.permit_roof_permit_number,
    permit_electric_age:           ghlFields.permit_electric_age,
    permit_electric_date:          formatDate(ghlFields.permit_electric_date),
    permit_electric_contractor:    ghlFields.permit_electric_contractor,
    permit_electric_permit_number: ghlFields.permit_electric_permit_number,
    permit_ac_age:                 ghlFields.permit_ac_age,
    permit_ac_date:                formatDate(ghlFields.permit_ac_date),
    permit_ac_contractor:          ghlFields.permit_ac_contractor,
    permit_ac_permit_number:       ghlFields.permit_ac_permit_number,
    permit_county:                 ghlFields.permit_county,
    permit_total_found:            ghlFields.permit_total_found,
    permit_last_checked:           ghlFields.permit_last_checked,
    permit_query_source:           ghlFields.permit_query_source,
    pa_homestead:                  ghlFields.pa_homestead,
    pa_owner_name:                 ghlFields.pa_owner_name,
    pa_year_built:                 ghlFields.pa_year_built,
    pa_sqft:                       ghlFields.pa_sqft,
    pa_assessed_value:             ghlFields.pa_assessed_value,
    pa_owner_mailing:              ghlFields.pa_owner_mailing,
  };

  // Convertir a array de {key, field_value} — solo los que tienen valor
  return Object.entries(fieldMap)
    .filter(([, val]) => val != null && val !== '')
    .map(([key, field_value]) => ({ key, field_value: String(field_value) }));
}

// GHL DATE fields esperan formato MM/DD/YYYY o timestamp
function formatDate(dateStr) {
  if (!dateStr) return null;
  // dateStr viene como "06/2024" → convertir a "06/01/2024"
  if (/^\d{2}\/\d{4}$/.test(dateStr)) {
    const [month, year] = dateStr.split('/');
    return `${month}/01/${year}`;
  }
  return dateStr;
}

router.post('/', async (req, res) => {
  try {
    const { address, ghlFields, ownerName } = req.body;
    if (!address || !ghlFields) {
      return res.status(400).json({ success: false, error: 'Faltan datos requeridos' });
    }

    const locationId = config.GHL_LOCATION_ID;
    const customFields = buildCustomFields(ghlFields);

    // ── PASO 1: Buscar contacto por dirección ──────────────
    const searchRes = await axios.get(`${GHL_BASE}/contacts/search`, {
      headers: GHL_HEADERS,
      params: {
        locationId,
        query: address,
        limit: 5
      }
    });

    const contacts = searchRes.data?.contacts || [];
    // Buscar el que tenga la dirección más parecida
    let contact = contacts.find(c => {
      const addr = (c.address1 || '').toUpperCase();
      const searchNum = address.split(' ')[0];
      return addr.includes(searchNum);
    }) || contacts[0] || null;

    let contactId = contact?.id || null;
    let action = 'updated';

    // ── PASO 2: Si no existe, crear contacto ───────────────
    if (!contactId) {
      const createRes = await axios.post(`${GHL_BASE}/contacts/`, {
        locationId,
        firstName: ownerName ? ownerName.split(' ')[0] : 'Propietario',
        lastName:  ownerName ? ownerName.split(' ').slice(1).join(' ') : address,
        address1:  address,
        source:    'PermitIQ',
        customFields,
      }, { headers: GHL_HEADERS });

      contactId = createRes.data?.contact?.id;
      action = 'created';
    } else {
      // ── PASO 3: Actualizar contacto existente ─────────────
      await axios.put(`${GHL_BASE}/contacts/${contactId}`, {
        customFields,
      }, { headers: GHL_HEADERS });
    }

    res.json({
      success: true,
      action,
      contactId,
      fieldsUpdated: customFields.length,
      message: action === 'created'
        ? `Contacto creado en GHL con ${customFields.length} campos`
        : `${customFields.length} campos actualizados en GHL`
    });

  } catch(e) {
    console.error('GHL push error:', e.response?.data || e.message);
    res.status(500).json({
      success: false,
      error: e.response?.data?.message || e.message
    });
  }
});

module.exports = router;
