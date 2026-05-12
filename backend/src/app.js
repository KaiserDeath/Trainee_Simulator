import express from 'express';
import cors from 'cors';

import sessionRoutes from './routes/sessionRoutes.js';
import operationRoutes from './routes/operationRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import trainerRoutes from './routes/trainerRoutes.js';

const app = express();

app.use(cors());
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
app.use('/api/trainer', trainerRoutes);

export default app;