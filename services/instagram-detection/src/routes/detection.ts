import { Router } from 'express';
import { asyncHandler, AppError } from '@anatome-ai/utils';
import { QueueService } from '../services/queue';
import { SerperService } from '../services/serper';
import { RedisClient } from '../services/redis';

export const detectionRoutes = Router();
const queueService = QueueService.getInstance();
const serperService = SerperService.getInstance();
const redis = RedisClient.getInstance();

// Start Instagram profile detection for a business
detectionRoutes.post('/start', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { businessId, businessName, location, keywords } = req.body;

  if (!businessId || !businessName) {
    throw new AppError('Business ID and name are required', 400, 'VALIDATION_ERROR');
  }

  // Check if detection is already in progress
  const existingJob = await redis.getDetectionJob(businessId);
  if (existingJob && existingJob.status === 'processing') {
    return res.json({
      success: true,
      message: 'Detection already in progress',
      data: existingJob,
    });
  }

  // Queue Instagram detection
  await queueService.queueInstagramDetection(
    businessId,
    businessName,
    location,
    keywords
  );

  // Track the job
  const jobData = {
    businessId,
    businessName,
    location,
    keywords,
    status: 'processing',
    startedAt: new Date(),
  };

  await redis.setDetectionJob(businessId, jobData);

  res.json({
    success: true,
    message: 'Instagram detection started',
    data: jobData,
  });
}));

// Search Instagram profiles manually
detectionRoutes.post('/search', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { businessName, location, keywords } = req.body;

  if (!businessName) {
    throw new AppError('Business name is required', 400, 'VALIDATION_ERROR');
  }

  // Check rate limiting
  const rateLimitOk = await redis.checkRateLimit(`search:${userId}`, 10, 3600); // 10 searches per hour
  if (!rateLimitOk) {
    const rateLimitInfo = await redis.getRateLimitInfo(`search:${userId}`);
    throw new AppError('Search rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', true, rateLimitInfo);
  }

  // Search for Instagram profiles
  const profiles = await serperService.findInstagramProfiles({
    businessName,
    location,
    keywords,
  });

  res.json({
    success: true,
    data: {
      query: { businessName, location, keywords },
      profiles,
      total: profiles.length,
    },
  });
}));

// Validate Instagram profile
detectionRoutes.post('/validate', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { username } = req.body;

  if (!username) {
    throw new AppError('Instagram username is required', 400, 'VALIDATION_ERROR');
  }

  // Check rate limiting
  const rateLimitOk = await redis.checkRateLimit(`validate:${userId}`, 20, 3600); // 20 validations per hour
  if (!rateLimitOk) {
    throw new AppError('Validation rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED');
  }

  // Validate the profile
  const validation = await serperService.validateInstagramProfile(username);

  res.json({
    success: true,
    data: {
      username,
      ...validation,
    },
  });
}));

// Get detection status for a business
detectionRoutes.get('/status/:businessId', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { businessId } = req.params;
  
  const jobData = await redis.getDetectionJob(businessId);

  if (!jobData) {
    return res.json({
      success: true,
      data: {
        businessId,
        status: 'not_started',
        message: 'No detection job found for this business',
      },
    });
  }

  res.json({
    success: true,
    data: jobData,
  });
}));

// Get job status by ID
detectionRoutes.get('/jobs/:jobId', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  
  if (!userId || userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const job = await queueService.getJobStatus(req.params.jobId);

  if (!job) {
    throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  res.json({
    success: true,
    data: job,
  });
}));

// Get queue statistics (admin only)
detectionRoutes.get('/stats', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  
  if (!userId || userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const [queueStats, detectionStats, rateLimitStats] = await Promise.all([
    queueService.getQueueStats(),
    redis.getDetectionStats(),
    // Add more stats as needed
  ]);

  res.json({
    success: true,
    data: {
      queue: queueStats,
      detection: detectionStats,
      timestamp: new Date(),
    },
  });
}));

// Search Instagram content for a specific profile
detectionRoutes.post('/content/search', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { username, keywords } = req.body;

  if (!username) {
    throw new AppError('Instagram username is required', 400, 'VALIDATION_ERROR');
  }

  // Check rate limiting
  const rateLimitOk = await redis.checkRateLimit(`content:${userId}`, 15, 3600); // 15 content searches per hour
  if (!rateLimitOk) {
    throw new AppError('Content search rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED');
  }

  // Search for Instagram content
  const content = await serperService.searchInstagramContent(username, keywords);

  res.json({
    success: true,
    data: {
      username,
      keywords,
      content,
      total: content.length,
    },
  });
}));

// Get rate limit information
detectionRoutes.get('/rate-limit/:type', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { type } = req.params;
  const validTypes = ['search', 'validate', 'content'];

  if (!validTypes.includes(type)) {
    throw new AppError('Invalid rate limit type', 400, 'VALIDATION_ERROR');
  }

  const rateLimitInfo = await redis.getRateLimitInfo(`${type}:${userId}`);

  res.json({
    success: true,
    data: {
      type,
      ...rateLimitInfo,
    },
  });
}));

// Clear detection cache (admin only)
detectionRoutes.delete('/cache', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  
  if (!userId || userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const { pattern } = req.query;
  
  await redis.clearDetectionCache(pattern as string);

  res.json({
    success: true,
    message: 'Detection cache cleared',
    pattern: pattern || 'detection:*',
  });
}));

// Retry failed detection
detectionRoutes.post('/retry/:businessId', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { businessId } = req.params;
  const { businessName, location, keywords } = req.body;

  if (!businessName) {
    throw new AppError('Business name is required for retry', 400, 'VALIDATION_ERROR');
  }

  // Clear any existing job data
  await redis.deleteDetectionJob(businessId);

  // Queue new detection
  await queueService.queueInstagramDetection(
    businessId,
    businessName,
    location,
    keywords
  );

  // Track the new job
  const jobData = {
    businessId,
    businessName,
    location,
    keywords,
    status: 'processing',
    startedAt: new Date(),
    retry: true,
  };

  await redis.setDetectionJob(businessId, jobData);

  res.json({
    success: true,
    message: 'Instagram detection retry initiated',
    data: jobData,
  });
}));