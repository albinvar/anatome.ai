import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { DatabaseConnection, Logger, errorHandler } from '@anatome-ai/utils';
import { instagramRoutes } from './routes/instagram';
import { detectionRoutes } from './routes/detection';
import { QueueService } from './services/queue';
import { RedisClient } from './services/redis';

dotenv.config();

const app = express();
const logger = new Logger('instagram-detection');
const db = DatabaseConnection.getInstance('instagram-detection');

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/instagram', instagramRoutes);
app.use('/detection', detectionRoutes);

// Health check
app.get('/health', async (req, res) => {
  const checks = {
    database: db.isHealthy(),
    queue: await QueueService.getInstance().isHealthy(),
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

const PORT = process.env.PORT || 3003;

async function start() {
  try {
    // Connect to MongoDB
    await db.connect();
    
    // Initialize Redis
    await RedisClient.getInstance().connect();
    
    // Initialize queue service
    await QueueService.getInstance().initialize();

    app.listen(PORT, () => {
      logger.info(`Instagram Detection service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

start();