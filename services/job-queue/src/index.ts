import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import { Logger, errorHandler, connectMongoDB } from '@anatome-ai/utils';
import { QueueManager } from './services/queueManager';
import { jobRoutes } from './routes/jobs';
import { queueRoutes } from './routes/queues';
import { healthRoutes } from './routes/health';
import { schedulerRoutes } from './routes/scheduler';
import { JobScheduler } from './services/scheduler';

// Load environment variables
config();

const app = express();
const logger = new Logger('job-queue');

// Security and middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.http(message.trim()),
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit for job queue service
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/', limiter);

// Routes
app.use('/health', healthRoutes);
app.use('/jobs', jobRoutes);
app.use('/queues', queueRoutes);
app.use('/scheduler', schedulerRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

const PORT = process.env.PORT || 3009;

async function startServer() {
  try {
    // Connect to MongoDB
    await connectMongoDB();
    logger.info('Connected to MongoDB');

    // Initialize Queue Manager
    await QueueManager.getInstance().initialize();
    logger.info('Queue Manager initialized');

    // Start Job Scheduler
    await JobScheduler.getInstance().start();
    logger.info('Job Scheduler started');

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`Job Queue Service running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await QueueManager.getInstance().shutdown();
      await JobScheduler.getInstance().stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await QueueManager.getInstance().shutdown();
      await JobScheduler.getInstance().stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start Job Queue Service:', error);
    process.exit(1);
  }
}

startServer();