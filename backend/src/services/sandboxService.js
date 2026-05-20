import { supabase } from '../config/supabase.js';

const botManagers = [
  'Bot-V2',
  'Bot-V3',
  'Bot-V4',
  'Bot-V4.1'
];

const historicalGames = [
  'Orion Stars',
  'Vblink',
  'Golden Dragon',
  'Glamour Spin',
  'Golden Treasure',
  'River Sweeps',
  'Ultra Panda',
  'Yolo'
];

const operationTypes = [
  'ADD CREDITS',
  'WITHDRAW CREDITS'
];

function createOperationCode(index) {
  return `SBOX${String(index + 1)
    .padStart(5, '0')}`;
}

function createMobileId() {
  const part = () =>
    Math.floor(
      100 + Math.random() * 900
    );
  return `M-${part()}-${part()}-${part()}`;
}

function createGoldenDragonPassword() {
  return String(
    Math.floor(
      1000000 + Math.random() * 9000000
    )
  );
}

function minutesAgo(minutes) {
  return new Date(
    Date.now() - minutes * 60 * 1000
  );
}

function createMovementHistory({
  customer,
  index,
  minutesBack,
  gameAccounts = {}
}) {
  const requestedAt =
    minutesAgo(minutesBack);

  const acceptedAt =
    new Date(
      requestedAt.getTime() +
      (15 + (index % 4) * 21) * 1000
    );

  const type =
    operationTypes[
      index % operationTypes.length
    ];

  const amount =
    type === 'ADD CREDITS'
      ? [20, 25, 30, 33, 50][index % 5]
      : [75, 100, 150, 300][index % 4];

  const manager =
    index % 7 === 0
      ? 'JesusL'
      : botManagers[
          index % botManagers.length
        ];

  const game =
    historicalGames[
      index % historicalGames.length
    ];

  let playerId = '';
  if (gameAccounts && gameAccounts[game]) {
    playerId = gameAccounts[game];
  } else if (game === 'Golden Dragon') {
    playerId = createMobileId();
  } else {
    playerId = `${customer.username}${game
      .replaceAll(' ', '')
      .slice(0, 3)
      .toLowerCase()}`;
  }

  return {
    session_id: customer.session_id,
    customer_id: customer.id,
    type,
    amount,
    description: JSON.stringify({
      kind: 'MOVEMENT_HISTORY',
      operationCode:
        createOperationCode(index),
      playerId,
      playerEmail: customer.email,
      game,
      requestedAt:
        requestedAt.toISOString(),
      acceptedAt:
        acceptedAt.toISOString(),
      manager,
      status: 'Approved'
    }),
    created_at:
      acceptedAt.toISOString()
  };
}

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
      username: 'johndoe',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@test.com',
      balance: 500
    },
    {
      session_id: session.id,
      username: 'janesmith',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@test.com',
      balance: 1200
    },
    {
      session_id: session.id,
      username: 'tattedboymama',
      first_name: 'Ryann',
      last_name: 'Bailey',
      email: 'ryannbailey0624@gmail.com',
      balance: 0.53
    },
    {
      session_id: session.id,
      username: 'mariacashier',
      first_name: 'Maria',
      last_name: 'Lopez',
      email: 'maria.lopez@test.com',
      balance: 340.75
    },
    {
      session_id: session.id,
      username: 'devinplays',
      first_name: 'Devin',
      last_name: 'Stone',
      email: 'devin.stone@test.com',
      balance: 860
    },
    {
      session_id: session.id,
      username: 'ninagold',
      first_name: 'Nina',
      last_name: 'Patel',
      email: 'nina.patel@test.com',
      balance: 215.4
    },
    {
      session_id: session.id,
      username: 'carlosspin',
      first_name: 'Carlos',
      last_name: 'Rivera',
      email: 'carlos.rivera@test.com',
      balance: 1580
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
  const customerGameUsernames = {};

  for (const customer of customers) {
    const gdUsername = createMobileId();
    customerGameUsernames[customer.id] = {
      'Orion Stars': `${customer.username}_os`,
      'Vblink': `${customer.username}_vb`,
      'Golden Dragon': gdUsername
    };

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
        game_username: gdUsername,
        password: createGoldenDragonPassword(),
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

  for (const [customerIndex, customer]
    of customers.entries()) {
    for (let index = 0; index < 16; index++) {
      history.push(
        createMovementHistory({
          customer,
          index:
            customerIndex * 100 + index,
          minutesBack:
            45 + index * 37 +
            customerIndex * 19,
          gameAccounts: customerGameUsernames[customer.id]
        })
      );
    }
  }

  const { error: historyError } =
    await supabase
    .from('sandbox_transaction_history')
    .insert(history);

  if (historyError) {
    throw historyError;
  }

  return session;
}