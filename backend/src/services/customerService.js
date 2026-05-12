import { supabase }
  from '../config/supabase.js';

export async function searchSessionCustomers({
  sessionId,
  query = ''
}) {
  let request = supabase
    .from('sandbox_customers')
    .select(`
      *,
      game_accounts:sandbox_game_accounts(
        id,
        game,
        game_username,
        balance
      )
    `)
    .eq('session_id', sessionId)
    .order('username', {
      ascending: true
    });

  const term = query.trim();

  if (term) {
    request = request.or(
      [
        `username.ilike.%${term}%`,
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
        `email.ilike.%${term}%`
      ].join(',')
    );
  }

  const { data, error } =
    await request;

  if (error) {
    throw error;
  }

  return data;
}

export async function getCustomerProfile({
  sessionId,
  customerId
}) {
  const { data, error } = await supabase
    .from('sandbox_customers')
    .select(`
      *,
      game_accounts:sandbox_game_accounts(
        id,
        game,
        game_username,
        balance
      )
    `)
    .eq('session_id', sessionId)
    .eq('id', customerId)
    .single();

  if (error || !data) {
    const notFound =
      new Error('Customer not found');
    notFound.statusCode = 404;
    throw notFound;
  }

  return data;
}

export async function getCustomerHistory({
  sessionId,
  customerId
}) {
  const { data, error } = await supabase
    .from('sandbox_transaction_history')
    .select('*')
    .eq('session_id', sessionId)
    .eq('customer_id', customerId)
    .order('created_at', {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data;
}
