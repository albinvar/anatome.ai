import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Logger, errorHandler } from '@anatome-ai/utils';
import { config } from './config';
import { authMiddleware } from './middleware/auth';
import { healthRouter } from './routes/health';
import { setupSwagger } from './swagger';

const app = express();
const logger = new Logger('api-gateway');

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

// Compression and parsing
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
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW || '15') * 60 * 1000),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Health check route
app.use('/health', healthRouter);

// Setup Swagger documentation
setupSwagger(app);

// Service routes with authentication
const services = [
  {
    path: '/api/v1/auth',
    target: `http://${config.services.userManagement.host}:${config.services.userManagement.port}`,
    requireAuth: false,
  },
  {
    path: '/api/v1/users',
    target: `http://${config.services.userManagement.host}:${config.services.userManagement.port}`,
    requireAuth: true,
  },
  {
    path: '/api/v1/businesses',
    target: `http://${config.services.businessDiscovery.host}:${config.services.businessDiscovery.port}`,
    requireAuth: true,
  },
  {
    path: '/api/v1/discovery',
    target: `http://${config.services.businessDiscovery.host}:${config.services.businessDiscovery.port}`,
    requireAuth: true,
  },
  {
    path: '/api/v1/instagram',
    target: `http://${config.services.instagramDetection.host}:${config.services.instagramDetection.port}`,
    requireAuth: true,
  },
  {
    path: '/api/v1/videos',
    target: `http://${config.services.videoAnalysis.host}:${config.services.videoAnalysis.port}`,
    requireAuth: true,
  },
  {
    path: '/api/v1/scraping',
    target: `http://${config.services.videoScraping.host}:${config.services.videoScraping.port}`,
    requireAuth: true,
  },
  {
    path: '/api/v1/analytics',
    target: `http://${config.services.analytics.host}:${config.services.analytics.port}`,
    requireAuth: true,
  },
  {
    path: '/api/v1/reports',
    target: `http://${config.services.reportGeneration.host}:${config.services.reportGeneration.port}`,
    requireAuth: true,
  },
  {
    path: '/api/v1/files',
    target: `http://${config.services.fileStorage.host}:${config.services.fileStorage.port}`,
    requireAuth: true,
  },
  {
    path: '/api/v1/jobs',
    target: `http://${config.services.jobQueue.host}:${config.services.jobQueue.port}`,
    requireAuth: true,
  },
];

// Setup proxy for each service
services.forEach((service) => {
  const proxyOptions = {
    target: service.target,
    changeOrigin: true,
    pathRewrite: {
      [`^${service.path}`]: '',
    },
    onError: (err: any, req: any, res: any) => {
      logger.error(`Proxy error for ${service.path}:`, err);
      res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable',
        },
      });
    },
    onProxyReq: (proxyReq: any, req: any) => {
      // Forward user information from JWT to downstream services
      if ((req as any).user) {
        proxyReq.setHeader('X-User-Id', (req as any).user.id);
        proxyReq.setHeader('X-User-Email', (req as any).user.email);
        proxyReq.setHeader('X-User-Role', (req as any).user.role);
      }
    },
  };

  if (service.requireAuth) {
    app.use(service.path, authMiddleware, createProxyMiddleware(proxyOptions));
  } else {
    app.use(service.path, createProxyMiddleware(proxyOptions));
  }
});

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

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
});