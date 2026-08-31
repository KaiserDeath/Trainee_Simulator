import { supabase } from '../config/supabase.js';

import { buildGameWalletSeeds }
  from '../domain/gameWallet.js';

const SEEDED_GAMES = [
  'Orion Stars',
  'Vblink',
  'Golden Dragon'
];

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

export const SEEDED_CUSTOMER_COUNT = 26;

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
      email: 'john.doe@example.test',
      balance: 500
    },
    {
      session_id: session.id,
      username: 'janesmith',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane.smith@example.test',
      balance: 1200
    },
    {
      session_id: session.id,
      username: 'tattedboymama',
      first_name: 'Ryann',
      last_name: 'Bailey',
      email: 'ryann.bailey@example.test',
      balance: 0.53
    },
    {
      session_id: session.id,
      username: 'mariacashier',
      first_name: 'Maria',
      last_name: 'Lopez',
      email: 'maria.lopez@example.test',
      balance: 340.75
    },
    {
      session_id: session.id,
      username: 'devinplays',
      first_name: 'Devin',
      last_name: 'Stone',
      email: 'devin.stone@example.test',
      balance: 860
    },
    {
      session_id: session.id,
      username: 'ninagold',
      first_name: 'Nina',
      last_name: 'Patel',
      email: 'nina.patel@example.test',
      balance: 215.4
    },
    {
      session_id: session.id,
      username: 'carlosspin',
      first_name: 'Carlos',
      last_name: 'Rivera',
      email: 'carlos.rivera@example.test',
      balance: 1580
    },
    {
      session_id: session.id,
      username: 'alexcrowe',
      first_name: 'Alex',
      last_name: 'Crowe',
      email: 'alex.crowe@example.test',
      balance: 745
    },
    {
      session_id: session.id,
      username: 'biancareed',
      first_name: 'Bianca',
      last_name: 'Reed',
      email: 'bianca.reed@example.test',
      balance: 980.25
    },
    {
      session_id: session.id,
      username: 'diegofrost',
      first_name: 'Diego',
      last_name: 'Frost',
      email: 'diego.frost@example.test',
      balance: 610
    },
    {
      session_id: session.id,
      username: 'elenapark',
      first_name: 'Elena',
      last_name: 'Park',
      email: 'elena.park@example.test',
      balance: 1325
    },
    {
      session_id: session.id,
      username: 'felixhart',
      first_name: 'Felix',
      last_name: 'Hart',
      email: 'felix.hart@example.test',
      balance: 425.5
    },
    {
      session_id: session.id,
      username: 'gabriellaray',
      first_name: 'Gabriella',
      last_name: 'Ray',
      email: 'gabriella.ray@example.test',
      balance: 1120
    },
    {
      session_id: session.id,
      username: 'hugoellis',
      first_name: 'Hugo',
      last_name: 'Ellis',
      email: 'hugo.ellis@example.test',
      balance: 290
    },
    {
      session_id: session.id,
      username: 'isabelnorth',
      first_name: 'Isabel',
      last_name: 'North',
      email: 'isabel.north@example.test',
      balance: 1760
    },
    {
      session_id: session.id,
      username: 'jasperking',
      first_name: 'Jasper',
      last_name: 'King',
      email: 'jasper.king@example.test',
      balance: 535.75
    },
    {
      session_id: session.id,
      username: 'kiarawells',
      first_name: 'Kiara',
      last_name: 'Wells',
      email: 'kiara.wells@example.test',
      balance: 890
    },
    {
      session_id: session.id,
      username: 'leoramos',
      first_name: 'Leo',
      last_name: 'Ramos',
      email: 'leo.ramos@example.test',
      balance: 1495
    },
    {
      session_id: session.id,
      username: 'miabrooks',
      first_name: 'Mia',
      last_name: 'Brooks',
      email: 'mia.brooks@example.test',
      balance: 365.25
    },
    {
      session_id: session.id,
      username: 'noahprice',
      first_name: 'Noah',
      last_name: 'Price',
      email: 'noah.price@example.test',
      balance: 1080
    },
    {
      session_id: session.id,
      username: 'oliviabanks',
      first_name: 'Olivia',
      last_name: 'Banks',
      email: 'olivia.banks@example.test',
      balance: 675
    },
    {
      session_id: session.id,
      username: 'pablomiles',
      first_name: 'Pablo',
      last_name: 'Miles',
      email: 'pablo.miles@example.test',
      balance: 1540.5
    },
    {
      session_id: session.id,
      username: 'quinnharper',
      first_name: 'Quinn',
      last_name: 'Harper',
      email: 'quinn.harper@example.test',
      balance: 815
    },
    {
      session_id: session.id,
      username: 'rosasutton',
      first_name: 'Rosa',
      last_name: 'Sutton',
      email: 'rosa.sutton@example.test',
      balance: 455
    },
    {
      session_id: session.id,
      username: 'samircole',
      first_name: 'Samir',
      last_name: 'Cole',
      email: 'samir.cole@example.test',
      balance: 1260
    },
    {
      session_id: session.id,
      username: 'taylorng',
      first_name: 'Taylor',
      last_name: 'Ng',
      email: 'taylor.ng@example.test',
      balance: 705.5
    }
  ];

  if (customersSeed.length !== SEEDED_CUSTOMER_COUNT) {
    throw new Error('Seeded customer profile count is out of sync.');
  }

  const { data: customers, error: customerError } = await supabase
    .from('sandbox_customers')
    .insert(customersSeed)
    .select();

  if (customerError) {
    throw customerError;
  }

  // 3. Create independent game loading wallets.
  // These balances belong to each game backoffice, not to a customer.
  const { error: walletError } =
    await supabase
      .from('sandbox_game_wallets')
      .insert(
        buildGameWalletSeeds({
          sessionId: session.id,
          games: SEEDED_GAMES
        })
      );

  if (walletError) {
    throw walletError;
  }

  // 4. Create customer game accounts
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

  // 5. Generate seeded Backend customer movement history
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
