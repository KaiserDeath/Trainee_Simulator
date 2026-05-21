import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 1. Asegurar la lectura en cualquier entorno
dotenv.config(); 

const supabaseUrl = process.env.SUPABASE_URL;
// 2. Usar service_role localmente o anon key como respaldo si falta en producción
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// 3. En lugar de un "throw new Error" que apaga el servidor, usa un console.error
if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️ Advertencia: Faltan variables de entorno de Supabase.');
}

// 4. Crear el cliente de forma segura
export const supabase = createClient(
  supabaseUrl || 'https://supabase.co', 
  supabaseKey || 'placeholder-key'
);
