// =====================================================================
// supabase-client.js
// Configuración central de la conexión a Supabase.
// IMPORTANTE: Reemplaza estos valores con los de TU proyecto.
// Los encuentras en: Supabase Dashboard -> Project Settings -> API
// =====================================================================

const SUPABASE_URL = "https://lsyvtohbhrgzmqtvuqop.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Mx1ZMCY26g7i2lbxyrasIQ_Bic7PtjS";

// El cliente se expone como variable global `supabaseClient`
// para que todas las demás páginas puedan usarlo directamente.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
