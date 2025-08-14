import { Router } from 'express';
import { asyncHandler } from '@anatome-ai/utils';
import { QueueManager } from '../services/queueManager';
import mongoose from 'mongoose';

export const healthRoutes = Router();
const queueManager = QueueManager.getInstance();

// Basic health check
healthRoutes.get('/', asyncHandler(async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      database: false,
      redis: false,
      queues: false,
      memory: false,
    },
    details: {} as any,
  };

  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState === 1) {
      health.checks.database = true;
    } else {
      health.status = 'unhealthy';
      health.details.database = 'MongoDB connection not ready';
    }

    // Check Redis connection (through queue manager)
    try {
      const queueStats = await queueManager.getQueueStats();
      health.checks.redis = true;
      health.checks.queues = true;
      health.details.queues = Object.keys(queueStats).length;
    } catch (error: any) {
      health.status = 'unhealthy';
      health.checks.redis = false;
      health.details.redis = error.message;
    }

    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    if (memoryUsagePercent < 90) {
      health.checks.memory = true;
    } else {
      health.status = 'warning';
      health.details.memory = `High memory usage: ${memoryUsagePercent.toFixed(2)}%`;
    }

    health.details.memory = {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      usage: `${memoryUsagePercent.toFixed(2)}%`,
    };

  } catch (error: any) {
    health.status = 'unhealthy';
    health.details.error = error.message;
  }

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'warning' ? 200 : 503;
  
  res.status(statusCode).json(health);
}));

// Detailed health check
healthRoutes.get('/detailed', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    return res.status(403).json({
      status: 'forbidden',
      message: 'Admin access required for detailed health check',
    });
  }

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    },
    checks: {} as any,
    queues: {} as any,
    performance: {} as any,
  };

  try {
    // Database check
    if (mongoose.connection.readyState === 1) {
      health.checks.database = {
        status: 'healthy',
        connection: 'ready',
        host: mongoose.connection.host,
        name: mongoose.connection.name,
      };
    } else {
      health.status = 'unhealthy';
      health.checks.database = {
        status: 'unhealthy',
        connection: 'not ready',
        readyState: mongoose.connection.readyState,
      };
    }

    // Queue checks
    try {
      const queueStats = await queueManager.getQueueStats();
      health.checks.queues = {
        status: 'healthy',
        totalQueues: Object.keys(queueStats).length,
      };
      
      health.queues = queueStats;
      
      // Check for problematic queues
      let hasProblematicQueues = false;
      Object.entries(queueStats).forEach(([queueName, stats]) => {
        if (stats.failed > stats.completed && stats.total > 10) {
          hasProblematicQueues = true;
          health.status = health.status === 'healthy' ? 'warning' : health.status;
        }
      });
      
      if (hasProblematicQueues) {
        health.checks.queues.status = 'warning';
        health.checks.queues.warning = 'Some queues have high failure rates';
      }
      
    } catch (error: any) {
      health.status = 'unhealthy';
      health.checks.queues = {
        status: 'unhealthy',
        error: error.message,
      };
    }

    // Memory and performance metrics
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    health.performance = {
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
        arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        usage: `${((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(2)}%`,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      eventLoop: {
        // Basic event loop check - in production you might use more sophisticated monitoring
        lag: 0, // Would need additional instrumentation
      },
    };

    // Memory warning check
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    if (memoryUsagePercent > 85) {
      health.status = health.status === 'healthy' ? 'warning' : health.status;
      health.checks.memory = {
        status: 'warning',
        usage: `${memoryUsagePercent.toFixed(2)}%`,
        message: 'High memory usage detected',
      };
    } else {
      health.checks.memory = {
        status: 'healthy',
        usage: `${memoryUsagePercent.toFixed(2)}%`,
      };
    }

  } catch (error: any) {
    health.status = 'unhealthy';
    health.checks.error = {
      status: 'error',
      message: error.message,
    };
  }

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'warning' ? 200 : 503;
  
  res.status(statusCode).json(health);
}));

// Readiness check (for Kubernetes/Docker)
healthRoutes.get('/ready', asyncHandler(async (req, res) => {
  const ready = {
    status: 'ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: false,
      queues: false,
    },
  };

  try {
    // Check if database is ready
    if (mongoose.connection.readyState === 1) {
      ready.checks.database = true;
    } else {
      ready.status = 'not ready';
    }

    // Check if queue manager is initialized
    try {
      await queueManager.getQueueStats();
      ready.checks.queues = true;
    } catch (error) {
      ready.status = 'not ready';
    }

  } catch (error) {
    ready.status = 'not ready';
  }

  const statusCode = ready.status === 'ready' ? 200 : 503;
  res.status(statusCode).json(ready);
}));

// Liveness check (for Kubernetes/Docker)
healthRoutes.get('/live', asyncHandler(async (req, res) => {
  // Simple liveness check - if the process is running and can respond, it's alive
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
  });
}));