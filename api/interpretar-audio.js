const MAX_AUDIO_BASE64_LENGTH = 5_600_000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const SUPABASE_URL_FALLBACK = 'https://iqdtobtborwnytkcexff.supabase.co';
const SUPABASE_KEY_FALLBACK = 'sb_publishable_xCRCmCF_huD2ed0D0IelvQ_WP1xM5Lg';

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método no permitido.' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return response.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en Vercel.' });
  }

  try {
    await validarSesion(request.headers.authorization);

    const { audioBase64, mimeType, fechaActual } = request.body || {};

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return response.status(400).json({ error: 'No se recibió un audio válido.' });
    }

    if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
      return response.status(413).json({ error: 'El audio supera el tamaño permitido.' });
    }

    const tiposPermitidos = new Set([
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
      'audio/mpeg',
      'audio/wav',
    ]);

    if (!tiposPermitidos.has(mimeType)) {
      return response.status(400).json({ error: 'El formato de audio no es compatible.' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaActual || '')) {
      return response.status(400).json({ error: 'La fecha actual no es válida.' });
    }

    const prompt = `Sos un asistente administrativo para negocios que trabajan por encargo.
Escuchá el audio en español y extraé únicamente los datos de un trabajo nuevo.
La fecha local actual del usuario es ${fechaActual}. Usala para resolver expresiones relativas como hoy, mañana, el viernes o la semana que viene.
No inventes datos. Si un dato no fue dicho, devolvé null (excepto observaciones, que puede ser una cadena vacía).
Interpretá expresiones monetarias habituales del español rioplatense y latinoamericano: por ejemplo, "20 mil" significa 20000.
cliente es el nombre del cliente; trabajo es la descripción breve del trabajo; costo, precio y sena son importes no negativos; fecha_entrega debe ser YYYY-MM-DD.
En observaciones incluí solamente detalles adicionales que no pertenezcan a los demás campos.`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: audioBase64 } },
            ],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                cliente: { type: 'STRING', nullable: true },
                trabajo: { type: 'STRING', nullable: true },
                costo: { type: 'NUMBER', nullable: true },
                precio: { type: 'NUMBER', nullable: true },
                sena: { type: 'NUMBER', nullable: true },
                fecha_entrega: { type: 'STRING', nullable: true },
                observaciones: { type: 'STRING' },
              },
              required: [
                'cliente',
                'trabajo',
                'costo',
                'precio',
                'sena',
                'fecha_entrega',
                'observaciones',
              ],
            },
          },
        }),
      },
    );

    const geminiBody = await geminiResponse.json().catch(() => ({}));

    if (!geminiResponse.ok) {
      console.error(
        'Gemini API error:',
        geminiResponse.status,
        geminiBody?.error?.message,
      );

      const mensaje = geminiResponse.status === 429
        ? 'La IA está temporalmente ocupada. Esperá unos segundos e intentá nuevamente.'
        : 'Gemini no pudo interpretar el audio.';

      return response
        .status(geminiResponse.status === 429 ? 429 : 502)
        .json({ error: mensaje });
    }

    const texto =
      geminiBody?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('') || '';

    if (!texto) {
      return response.status(502).json({
        error: 'Gemini no devolvió datos del trabajo.',
      });
    }

    const trabajo = normalizarTrabajo(JSON.parse(texto));
    return response.status(200).json({ trabajo });
  } catch (error) {
    console.error('interpretar-audio:', error);
    const status = error.statusCode || 500;

    return response.status(status).json({
      error: status === 401
        ? 'Tu sesión venció. Volvé a iniciar sesión.'
        : 'No se pudo procesar el audio. Intentá nuevamente.',
    });
  }
};

async function validarSesion(authorization) {
  const encabezado = String(authorization || '').trim();

  if (!/^Bearer\s+\S+$/i.test(encabezado)) {
    throw crearError(401, 'Sesión ausente.');
  }

  const token = encabezado.replace(/^Bearer\s+/i, '').trim();
  const supabaseUrl =
    limpiarValorEntorno(process.env.SUPABASE_URL) || SUPABASE_URL_FALLBACK;

  const claveConfigurada =
    limpiarValorEntorno(process.env.SUPABASE_ANON_KEY);

  const claves = [
    ...new Set([claveConfigurada, SUPABASE_KEY_FALLBACK].filter(Boolean)),
  ];

  for (const apikey of claves) {
    const authResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey,
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    );

    if (authResponse.ok) return;

    const detalle = await authResponse.text().catch(() => '');

    console.warn(
      'Supabase rechazó la sesión:',
      authResponse.status,
      detalle.slice(0, 300),
    );
  }

  throw crearError(401, 'Sesión inválida.');
}

function limpiarValorEntorno(valor) {
  return typeof valor === 'string'
    ? valor.trim().replace(/^['"]|['"]$/g, '')
    : '';
}

function normalizarTrabajo(valor) {
  const numero = (dato) =>
    Number.isFinite(Number(dato)) && Number(dato) >= 0
      ? Number(dato)
      : null;

  const texto = (dato) =>
    typeof dato === 'string' && dato.trim()
      ? dato.trim().slice(0, 500)
      : null;

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(valor?.fecha_entrega || '')
    ? valor.fecha_entrega
    : null;

  return {
    cliente: texto(valor?.cliente),
    trabajo: texto(valor?.trabajo),
    costo: numero(valor?.costo),
    precio: numero(valor?.precio),
    sena: numero(valor?.sena),
    fecha_entrega: fecha,
    observaciones:
      typeof valor?.observaciones === 'string'
        ? valor.observaciones.trim().slice(0, 1000)
        : '',
  };
}

function crearError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
