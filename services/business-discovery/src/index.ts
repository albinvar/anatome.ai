import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { DatabaseConnection, Logger, errorHandler } from '@anatome-ai/utils';
import { businessRoutes } from './routes/businesses';
import { discoveryRoutes } from './routes/discovery';
import { QueueService } from './services/queue';

dotenv.config();

const app = express();
const logger = new Logger('business-discovery');
const db = DatabaseConnection.getInstance('business-discovery');

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/businesses', businessRoutes);
app.use('/discovery', discoveryRoutes);

// Health check
app.get('/health', async (req, res) => {
  const checks = {
    database: db.isHealthy(),
    queue: await QueueService.getInstance().isHealthy(),
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

const PORT = process.env.PORT || 3002;

async function start() {
  try {
    // Connect to MongoDB
    await db.connect();
    
    // Initialize queue service
    await QueueService.getInstance().initialize();

    app.listen(PORT, () => {
      logger.info(`Business Discovery service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

start();