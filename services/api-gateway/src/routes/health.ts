import { Router } from 'express';
import { ServiceHealth } from '@anatome-ai/types';
import axios from 'axios';
import { config } from '../config';

export const healthRouter = Router();

const checkServiceHealth = async (name: string, url: string): Promise<ServiceHealth> => {
  const startTime = Date.now();
  try {
    const response = await axios.get(`${url}/health`, { timeout: 3000 });
    const responseTime = Date.now() - startTime;
    
    return {
      service: name,
      status: response.status === 200 ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      responseTime,
      timestamp: new Date(),
      checks: response.data?.checks || {},
    };
  } catch (error) {
    return {
      service: name,
      status: 'unhealthy',
      uptime: process.uptime(),
      responseTime: Date.now() - startTime,
      timestamp: new Date(),
      checks: {},
    };
  }
};

healthRouter.get('/', async (req, res) => {
  const services = [
    { name: 'user-management', url: `http://${config.services.userManagement.host}:${config.services.userManagement.port}` },
    { name: 'business-discovery', url: `http://${config.services.businessDiscovery.host}:${config.services.businessDiscovery.port}` },
    { name: 'instagram-detection', url: `http://${config.services.instagramDetection.host}:${config.services.instagramDetection.port}` },
    { name: 'video-scraping', url: `http://${config.services.videoScraping.host}:${config.services.videoScraping.port}` },
    { name: 'video-analysis', url: `http://${config.services.videoAnalysis.host}:${config.services.videoAnalysis.port}` },
    { name: 'report-generation', url: `http://${config.services.reportGeneration.host}:${config.services.reportGeneration.port}` },
    { name: 'analytics', url: `http://${config.services.analytics.host}:${config.services.analytics.port}` },
    { name: 'file-storage', url: `http://${config.services.fileStorage.host}:${config.services.fileStorage.port}` },
    { name: 'job-queue', url: `http://${config.services.jobQueue.host}:${config.services.jobQueue.port}` },
  ];

  const healthChecks = await Promise.all(
    services.map(service => checkServiceHealth(service.name, service.url))
  );

  const allHealthy = healthChecks.every(check => check.status === 'healthy');
  const status = allHealthy ? 200 : 503;

  res.status(status).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date(),
    services: healthChecks,
    gateway: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: config.environment,
    },
  });
});

healthRouter.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date(),
  });
});

healthRouter.get('/ready', (req, res) => {
  // Check if gateway is ready to handle requests
  const isReady = true; // Add more checks if needed
  
  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    timestamp: new Date(),
  });
});