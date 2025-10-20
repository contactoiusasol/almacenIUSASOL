// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(bodyParser.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || 'https://almacen-iusasol-mzug.vercel.app/';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

app.post('/api/invite', async (req, res) => {
  try {
    const { nombre = '', apellido = '', email, role = 'cliente' } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    const emailClean = email.trim().toLowerCase();
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(emailClean, {
      redirectTo: `${SITE_URL}/set-password`,
      data: { nombre, apellido, role }
    });

    if (error) {
      console.error('Invite error:', error);
      return res.status(500).json({ error: error.message || 'Error al invitar' });
    }

    res.json({ ok: true, message: 'Invitación enviada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Invite server listening on ${port}`));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de invitaciones corriendo en http://localhost:${PORT}`);
});
