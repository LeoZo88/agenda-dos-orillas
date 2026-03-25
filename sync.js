import { createClient } from '@supabase/supabase-js';


const supabase = createClient(
  process.env.AGENDA_SUPABASE_URL,
  process.env.AGENDA_SUPABASE_ANON_KEY
);

const SERPAPI_KEY = process.env.SERPAPI_KEY;

const prompt = `Eres un especialista en agenda cultural y turística de la provincia de Entre Ríos, Argentina.

TAREA:
Busca y compila una lista de eventos culturales y de ocio que se realizarán en Concordia, Entre Ríos y las ciudades cercanas de la región (e.g., Colón, Salto, Gualeguaychú) para este próximo fin de semana.

ENRIQUECIMIENTO:
Prioriza la búsqueda de información en los siguientes sitios web para obtener detalles precisos y actualizados:
bocaaboca.com.ar
entrerios.gov.ar/cultura/noticias/
instagram.com/laviejausinaer

FORMATO DE SALIDA REQUERIDO:
El resultado final debe ser una única lista en formato JSON con un array llamado eventos que contenga un mínimo de 20 objetos de eventos.

Cada objeto de evento debe contener las siguientes claves:
"titulo": (String)
"resumen": (String, Resumen del evento)
"horario": (String, p. ej., "Sábado 20:30 hs" o "Todo el fin de semana")
"lugar": (String, p. ej., "Teatro Odeón")
"ciudad": (String)
"pais": (String, "Argentina")

IMPORTANTE: SOLO devuelve el código JSON. No incluyas texto explicativo, preámbulos, ni etiquetas de código Markdown.`;

async function syncAgenda() {
  console.log('🔄 Iniciando sync de agenda...', new Date().toISOString());

  // 1. Llamar a SerpAPI
  const url = `https://serpapi.com/search.json?engine=google_ai_overview&q=${encodeURIComponent(prompt)}&api_key=${SERPAPI_KEY}&gl=ar`;

  const serpResponse = await fetch(url);
  if (!serpResponse.ok) {
    throw new Error(`SerpAPI error: ${serpResponse.status} ${serpResponse.statusText}`);
  }

  const serpData = await serpResponse.json();

  // 2. Extraer el JSON de la respuesta
  let codeStr = null;

  if (Array.isArray(serpData.text_blocks)) {
    const jsonBlock = serpData.text_blocks.find(b => typeof b.snippet === 'string');
    if (jsonBlock) codeStr = jsonBlock.snippet;
  }

  if (!codeStr && typeof serpData.output === 'string') {
    codeStr = serpData.output;
  }

  if (!codeStr) {
    throw new Error('No se encontró contenido JSON en la respuesta de SerpAPI');
  }

  // Limpiar backticks si los hay
  codeStr = codeStr
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const parsed = JSON.parse(codeStr);

  if (!parsed || !Array.isArray(parsed.eventos)) {
    throw new Error('El JSON no trae eventos como array');
  }

  console.log(`✅ SerpAPI devolvió ${parsed.eventos.length} eventos`);

  // 3. Limpiar tabla
  const { error: deleteError } = await supabase
    .from('agenda_eventos')
    .delete()
    .neq('id', 0);

  if (deleteError) throw new Error(`Error borrando tabla: ${deleteError.message}`);

  // 4. Insertar eventos nuevos
  const rows = parsed.eventos.map(e => ({
    titulo: e.titulo ?? null,
    descripcion: e.resumen ?? null,
    horario: e.horario ?? null,
    lugar: e.lugar ?? null,
    ciudad: e.ciudad ?? null,
    pais: e.pais ?? 'Argentina',
    updated_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase
    .from('agenda_eventos')
    .insert(rows);

  if (insertError) throw new Error(`Error insertando eventos: ${insertError.message}`);

  console.log(`✅ ${rows.length} eventos guardados en Supabase`);
  console.log('🎉 Sync completado exitosamente');
}

syncAgenda().catch(err => {
  console.error('❌ Error en sync:', err.message);
  process.exit(1);
});
