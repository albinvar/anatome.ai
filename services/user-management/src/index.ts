import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { DatabaseConnection, Logger, errorHandler } from '@anatome-ai/utils';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { RedisClient } from './services/redis';

dotenv.config();

const app = express();
const logger = new Logger('user-management');
const db = DatabaseConnection.getInstance('user-management');

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);

// Health check
app.get('/health', async (req, res) => {
  const checks = {
    database: db.isHealthy(),
    redis: await RedisClient.getInstance().isHealthy(),
  };

  const isHealthy = Object.values(checks).every(check => check);

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date(),
  });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    // Connect to MongoDB
    await db.connect();
    
    // Connect to Redis
    await RedisClient.getInstance().connect();

    app.listen(PORT, () => {
      logger.info(`User Management service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

start();