import { supabase } from '../config/supabase.js';

export async function createSandboxSession(traineeName) {
  // 1. Create session
  const { data: session, error: sessionError } = await supabase
    .from('trainee_sessions')
    .insert({
      trainee_name: traineeName
    })
    .select()
    .single();

  if (sessionError) {
    throw sessionError;
  }

  // 2. Seed customers
  const customersSeed = [
    {
      session_id: session.id,
      username: 'john_doe',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@test.com',
      balance: 500
    },
    {
      session_id: session.id,
      username: 'jane_smith',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@test.com',
      balance: 1200
    }
  ];

  const { data: customers, error: customerError } = await supabase
    .from('sandbox_customers')
    .insert(customersSeed)
    .select();

  if (customerError) {
    throw customerError;
  }

  // 3. Create game accounts
  const gameAccounts = [];

  for (const customer of customers) {
    gameAccounts.push(
      {
        session_id: session.id,
        customer_id: customer.id,
        game: 'Orion Stars',
        game_username: `${customer.username}_os`,
        password: '123456',
        balance: 100
      },
      {
        session_id: session.id,
        customer_id: customer.id,
        game: 'Vblink',
        game_username: `${customer.username}_vb`,
        password: '123456',
        balance: 200
      },
      {
        session_id: session.id,
        customer_id: customer.id,
        game: 'Golden Dragon',
        game_username: `${customer.username}_gd`,
        password: '123456',
        balance: 300
      }
    );
  }

  const { error: gameError } = await supabase
    .from('sandbox_game_accounts')
    .insert(gameAccounts);

  if (gameError) {
    throw gameError;
  }

  // 4. Generate seeded transaction history
  const history = [];

  for (const customer of customers) {
    history.push(
      {
        session_id: session.id,
        customer_id: customer.id,
        type: 'ADD CREDITS',
        amount: 100,
        description: 'Initial seeded credits'
      },
      {
        session_id: session.id,
        customer_id: customer.id,
        type: 'WITHDRAW CREDITS',
        amount: 50,
        description: 'Previous redeem'
      }
    );
  }

  await supabase
    .from('sandbox_transaction_history')
    .insert(history);

  return session;
}