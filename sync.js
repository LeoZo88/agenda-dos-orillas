import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.AGENDA_SUPABASE_URL,
  process.env.AGENDA_SUPABASE_ANON_KEY
);

const SERPAPI_KEY = process.env.SERPAPI_KEY;

async function syncAgenda() {
  console.log('🔄 Iniciando sync de agenda...', new Date().toISOString());

  // 1. Llamar a SerpAPI con query corta
  const query = 'eventos culturales fin de semana Concordia Entre Ríos Argentina';
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}&gl=ar&hl=es&num=10&location=Concordia,Entre+Rios,Argentina`;

  const serpResponse = await fetch(url);

  if (!serpResponse.ok) {
    const text = await serpResponse.text();
    throw new Error(`SerpAPI error: ${serpResponse.status} - ${text}`);
  }

  const serpData = await serpResponse.json();

  // 2. Extraer resultados orgánicos
  const results = serpData.organic_results ?? [];

  if (results.length === 0) {
    throw new Error('SerpAPI no devolvió resultados orgánicos');
  }

  console.log(`✅ SerpAPI devolvió ${results.length} resultados`);

  // 3. Convertir resultados a eventos
  const rows = results.map((r, idx) => ({
    titulo: r.title ?? `Evento ${idx + 1}`,
    descripcion: r.snippet ?? null,
    horario: null,
    lugar: null,
    ciudad: 'Concordia',
    pais: 'Argentina',
    updated_at: new Date().toISOString(),
  }));

  // 4. Limpiar tabla
  const { error: deleteError } = await supabase
    .from('agenda_eventos')
    .delete()
    .neq('id', 0);

  if (deleteError) throw new Error(`Error borrando tabla: ${deleteError.message}`);

  // 5. Insertar eventos nuevos
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