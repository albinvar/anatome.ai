import { Router } from 'express';
import { asyncHandler, AppError, validationSchemas, Validator } from '@anatome-ai/utils';
import { SerperService } from '../services/serper';
import { QueueService } from '../services/queue';
import { BusinessModel } from '../models/business';

export const discoveryRoutes = Router();
const serper = SerperService.getInstance();
const queueService = QueueService.getInstance();

// Search for businesses
discoveryRoutes.post('/search', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const data = Validator.validate(validationSchemas.businessSearch, req.body);

  // Search using Serper
  const results = await serper.searchBusinesses({
    query: data.name || '',
    location: data.location,
    type: data.type,
    radius: data.radius,
  });

  res.json({
    success: true,
    data: results,
  });
}));

// Discover competitors for existing business
discoveryRoutes.post('/competitors', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { businessId, radius = 50 } = req.body;

  if (!businessId) {
    throw new AppError('Business ID is required', 400, 'VALIDATION_ERROR');
  }

  const business = await BusinessModel.findOne({
    _id: businessId,
    userId,
  });

  if (!business) {
    throw new AppError('Business not found', 404, 'BUSINESS_NOT_FOUND');
  }

  // Search for competitors
  const competitors = await serper.searchCompetitors(
    {
      name: business.name,
      type: business.type,
      location: business.location,
      industry: business.industry,
    },
    radius
  );

  res.json({
    success: true,
    data: competitors,
  });
}));

// Get business details from search
discoveryRoutes.post('/details', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { businessName, location } = req.body;

  if (!businessName || !location) {
    throw new AppError('Business name and location are required', 400, 'VALIDATION_ERROR');
  }

  const details = await serper.getBusinessDetails(businessName, location);

  if (!details) {
    throw new AppError('Business details not found', 404, 'NOT_FOUND');
  }

  res.json({
    success: true,
    data: details,
  });
}));

// Get job status
discoveryRoutes.get('/jobs/:jobId', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
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

// Get queue statistics
discoveryRoutes.get('/stats', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  
  if (!userId || userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const stats = await queueService.getQueueStats();

  res.json({
    success: true,
    data: stats,
  });
}));

// Analyze market for a location and industry
discoveryRoutes.post('/market-analysis', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { location, industry, businessType, radius = 50 } = req.body;

  if (!location || !industry) {
    throw new AppError('Location and industry are required', 400, 'VALIDATION_ERROR');
  }

  // Search for all businesses in the area
  const businesses = await serper.searchBusinesses({
    query: `${industry} ${businessType || 'businesses'}`,
    location,
    radius,
  });

  // Group by estimated categories
  const analysis = {
    totalBusinesses: businesses.length,
    location,
    industry,
    radius,
    businesses: businesses.slice(0, 10), // Top 10
    competitionLevel: businesses.length > 20 ? 'high' : businesses.length > 10 ? 'medium' : 'low',
    marketInsights: {
      averageConfidence: businesses.reduce((sum, b) => sum + b.confidence, 0) / businesses.length,
      hasEstablishedPlayers: businesses.some(b => b.confidence > 0.8),
    },
  };

  res.json({
    success: true,
    data: analysis,
  });
}));