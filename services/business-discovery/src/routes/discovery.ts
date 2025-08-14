import { Router } from 'express';
import { asyncHandler, AppError, validationSchemas, Validator } from '@anatome-ai/utils';
import { SerperService } from '../services/serper';
import { QueueService } from '../services/queue';
import { BusinessModel } from '../models/business';
import axios from 'axios';

// Helper function to extract Instagram username from URL
function extractInstagramUsername(url: string): string | null {
  const match = url.match(/instagram\.com\/(\w+)/);
  return match ? match[1] : null;
}

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

  const { businessId } = req.body;
  const requestedRadius = parseInt(req.body.radius) || parseInt(process.env.DEFAULT_DISCOVERY_RADIUS || '50');
  const radius = Math.min(requestedRadius, parseInt(process.env.MAX_DISCOVERY_RADIUS || '100'));

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

// Discover businesses with Instagram detection (your main flow)
discoveryRoutes.post('/discover-with-instagram', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { businessName, location, businessType, industry } = req.body;
  const requestedRadius = parseInt(req.body.radius) || parseInt(process.env.DEFAULT_DISCOVERY_RADIUS || '50');
  const radius = Math.min(requestedRadius, parseInt(process.env.MAX_DISCOVERY_RADIUS || '100'));

  if (!businessName || !location) {
    throw new AppError('Business name and location are required', 400, 'VALIDATION_ERROR');
  }

  // Step 1: Use Serper Places API to find similar businesses in the given range
  const similarBusinesses = await serper.searchPlaces({
    query: businessType || industry || 'business',
    location,
    radius,
  });

  const results = [];
  let businessesWithInstagram = 0;
  let businessesNeedingSearch = 0;

  for (const business of similarBusinesses) {
    let instagramUrl = business.socialMedia?.instagram;
    let instagramFound = 'direct'; // direct, search, or none

    // Step 2: If Instagram not found in Places API, search for it
    if (!instagramUrl) {
      instagramUrl = await serper.searchInstagramForBusiness(business.name);
      instagramFound = instagramUrl ? 'search' : 'none';
      businessesNeedingSearch++;
    } else {
      businessesWithInstagram++;
    }

    const enrichedBusiness = {
      ...business,
      instagram: {
        url: instagramUrl,
        found: instagramFound,
        username: instagramUrl ? extractInstagramUsername(instagramUrl) : null,
      },
    };

    results.push(enrichedBusiness);

    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Step 3: Queue Instagram detection for businesses with Instagram profiles
  const businessesForInstagramDetection = results.filter(b => b.instagram.url);
  const queuedResults = [];
  
  // Queue Instagram detection jobs (call Instagram Detection Service)
  for (const business of businessesForInstagramDetection) {
    try {
      // Call Instagram Detection Service to create profile and queue analysis
      const instagramServiceUrl = process.env.INSTAGRAM_SERVICE_URL || 'http://instagram-detection:3003';
      
      const profileResponse = await axios.post(
        `${instagramServiceUrl}/instagram/profiles`,
        {
          businessId: `discovered_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          username: business.instagram.username,
          profileUrl: business.instagram.url,
        },
        {
          headers: {
            'x-user-id': userId,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      queuedResults.push({
        businessName: business.name,
        instagramUsername: business.instagram.username,
        profileId: profileResponse.data.data?.id,
        status: 'queued',
      });
      
      console.log(`Queued Instagram detection for: ${business.name} -> ${business.instagram.url}`);
    } catch (error: any) {
      console.error(`Failed to queue Instagram detection for ${business.name}:`, error.message);
      queuedResults.push({
        businessName: business.name,
        instagramUsername: business.instagram.username,
        status: 'failed',
        error: error.message,
      });
    }
  }

  const summary = {
    totalBusinessesFound: results.length,
    businessesWithInstagram: businessesWithInstagram,
    businessesFoundViaSearch: businessesNeedingSearch,
    businessesQueuedForAnalysis: queuedResults.filter(r => r.status === 'queued').length,
    businessesFailedToQueue: queuedResults.filter(r => r.status === 'failed').length,
    location,
    radius,
    searchQuery: businessType || industry,
  };

  res.json({
    success: true,
    data: {
      summary,
      businesses: results,
      queuedForAnalysis: queuedResults,
    },
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