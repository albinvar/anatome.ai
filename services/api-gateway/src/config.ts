import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  environment: process.env.NODE_ENV || 'development',
  services: {
    userManagement: {
      host: process.env.USER_MANAGEMENT_HOST || 'user-management',
      port: process.env.USER_MANAGEMENT_PORT || 3001,
    },
    businessDiscovery: {
      host: process.env.BUSINESS_DISCOVERY_HOST || 'business-discovery',
      port: process.env.BUSINESS_DISCOVERY_PORT || 3002,
    },
    instagramDetection: {
      host: process.env.INSTAGRAM_DETECTION_HOST || 'instagram-detection',
      port: process.env.INSTAGRAM_DETECTION_PORT || 3003,
    },
    videoScraping: {
      host: process.env.VIDEO_SCRAPING_HOST || 'video-scraping',
      port: process.env.VIDEO_SCRAPING_PORT || 8001,
    },
    videoAnalysis: {
      host: process.env.VIDEO_ANALYSIS_HOST || 'video-analysis',
      port: process.env.VIDEO_ANALYSIS_PORT || 3004,
    },
    reportGeneration: {
      host: process.env.REPORT_GENERATION_HOST || 'report-generation',
      port: process.env.REPORT_GENERATION_PORT || 3005,
    },
    analytics: {
      host: process.env.ANALYTICS_HOST || 'analytics',
      port: process.env.ANALYTICS_PORT || 3006,
    },
    fileStorage: {
      host: process.env.FILE_STORAGE_HOST || 'file-storage',
      port: process.env.FILE_STORAGE_PORT || 3007,
    },
    jobQueue: {
      host: process.env.JOB_QUEUE_HOST || 'job-queue',
      port: process.env.JOB_QUEUE_PORT || 3008,
    },
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'secret',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15') * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },
};