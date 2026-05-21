import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import sessionRoutes from './routes/sessionRoutes.js';
import operationRoutes from './routes/operationRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import trainerRoutes from './routes/trainerRoutes.js';

dotenv.config();

const app = express();

app.use(
  cors({
    origin: [
      'http://localhost:5173',
      process.env.CLIENT_URL
    ],
    credentials: true,
  })
);

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Simulador-dos backend running'
  });
});

app.use('/api/sessions', sessionRoutes);
app.use('/api/operations', operationRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/trainer', trainerRoutes);

export default app;
