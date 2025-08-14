import { Router } from 'express';
import { 
  asyncHandler, 
  AppError, 
  createPaginationOptions,
  createPaginationResponse 
} from '@anatome-ai/utils';
import { SocialProfileModel } from '../models/socialProfile';
import { QueueService } from '../services/queue';
import { ReelAnalyzer } from '../services/reelAnalyzer';

export const instagramRoutes = Router();
const queueService = QueueService.getInstance();
const reelAnalyzer = ReelAnalyzer.getInstance();

// Create or update Instagram profile
instagramRoutes.post('/profiles', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { businessId, username, profileUrl } = req.body;

  if (!businessId || !username) {
    throw new AppError('Business ID and username are required', 400, 'VALIDATION_ERROR');
  }

  // Check if profile already exists
  let profile = await SocialProfileModel.findOne({
    businessId,
    username,
    platform: 'instagram',
  });

  if (profile) {
    // Update existing profile
    if (profileUrl) profile.profileUrl = profileUrl;
    profile.detectionStatus = 'pending';
    await profile.save();
  } else {
    // Create new profile
    profile = new SocialProfileModel({
      businessId,
      platform: 'instagram',
      username,
      profileUrl: profileUrl || `https://instagram.com/${username}`,
      detectionStatus: 'pending',
    });
    await profile.save();
  }

  // Queue reel analysis
  await queueService.queueReelAnalysis(profile._id.toString(), username);

  res.status(201).json({
    success: true,
    data: profile.toJSON(),
  });
}));

// Get Instagram profiles for a business
instagramRoutes.get('/profiles/business/:businessId', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { businessId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const { skip } = createPaginationOptions(page, limit);

  const filter = { 
    businessId,
    platform: 'instagram',
  };

  if (req.query.status) {
    filter['detectionStatus'] = req.query.status;
  }

  const [profiles, total] = await Promise.all([
    SocialProfileModel.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ lastDetectionAt: -1, createdAt: -1 }),
    SocialProfileModel.countDocuments(filter),
  ]);

  const response = createPaginationResponse(
    profiles.map(p => p.toJSON()),
    total,
    page,
    limit
  );

  res.json({
    success: true,
    ...response,
  });
}));

// Get specific Instagram profile with top reels
instagramRoutes.get('/profiles/:profileId', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const profile = await SocialProfileModel.findById(req.params.profileId);
  
  if (!profile) {
    throw new AppError('Instagram profile not found', 404, 'PROFILE_NOT_FOUND');
  }

  res.json({
    success: true,
    data: profile.toJSON(),
  });
}));

// Get top reels for a profile
instagramRoutes.get('/profiles/:profileId/reels', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const profile = await SocialProfileModel.findById(req.params.profileId);
  
  if (!profile) {
    throw new AppError('Instagram profile not found', 404, 'PROFILE_NOT_FOUND');
  }

  const topN = parseInt(req.query.top as string) || 10;
  const reels = (profile.topReels || [])
    .sort((a, b) => a.rank - b.rank)
    .slice(0, topN);

  res.json({
    success: true,
    data: {
      profileId: profile._id,
      username: profile.username,
      totalReels: profile.topReels?.length || 0,
      reels,
      lastUpdated: profile.lastDetectionAt,
      status: profile.detectionStatus,
    },
  });
}));

// Trigger reel analysis for a profile
instagramRoutes.post('/profiles/:profileId/analyze', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const profile = await SocialProfileModel.findById(req.params.profileId);
  
  if (!profile) {
    throw new AppError('Instagram profile not found', 404, 'PROFILE_NOT_FOUND');
  }

  if (profile.detectionStatus === 'processing') {
    throw new AppError('Analysis already in progress', 409, 'ANALYSIS_IN_PROGRESS');
  }

  // Queue reel analysis
  await queueService.queueReelAnalysis(profile._id.toString(), profile.username);

  // Update status
  profile.detectionStatus = 'processing';
  await profile.save();

  res.json({
    success: true,
    message: 'Reel analysis initiated',
    data: {
      profileId: profile._id,
      username: profile.username,
      status: 'processing',
    },
  });
}));

// Get profile analytics
instagramRoutes.get('/profiles/:profileId/analytics', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const profile = await SocialProfileModel.findById(req.params.profileId);
  
  if (!profile) {
    throw new AppError('Instagram profile not found', 404, 'PROFILE_NOT_FOUND');
  }

  if (!profile.topReels || profile.topReels.length === 0) {
    return res.json({
      success: true,
      data: {
        profileId: profile._id,
        analytics: null,
        message: 'No reel data available for analytics',
      },
    });
  }

  // Convert to ranked reels format for analysis
  const rankedReels = profile.topReels.map(reel => ({
    ...reel,
    performanceScore: reel.engagementRate, // Simplified for now
  }));

  const analytics = await reelAnalyzer.getReelAnalytics(rankedReels as any);

  res.json({
    success: true,
    data: {
      profileId: profile._id,
      username: profile.username,
      analytics,
      lastUpdated: profile.lastDetectionAt,
    },
  });
}));

// Update Instagram profile
instagramRoutes.put('/profiles/:profileId', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const allowedUpdates = ['username', 'profileUrl', 'followers', 'following', 'posts'];
  const updates = Object.keys(req.body)
    .filter(key => allowedUpdates.includes(key))
    .reduce((obj, key) => {
      obj[key] = req.body[key];
      return obj;
    }, {} as any);

  const profile = await SocialProfileModel.findByIdAndUpdate(
    req.params.profileId,
    updates,
    { new: true, runValidators: true }
  );

  if (!profile) {
    throw new AppError('Instagram profile not found', 404, 'PROFILE_NOT_FOUND');
  }

  res.json({
    success: true,
    data: profile.toJSON(),
  });
}));

// Delete Instagram profile
instagramRoutes.delete('/profiles/:profileId', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const profile = await SocialProfileModel.findByIdAndDelete(req.params.profileId);
  
  if (!profile) {
    throw new AppError('Instagram profile not found', 404, 'PROFILE_NOT_FOUND');
  }

  res.json({
    success: true,
    message: 'Instagram profile deleted successfully',
  });
}));

// Bulk operations
instagramRoutes.post('/profiles/bulk/analyze', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { profileIds } = req.body;

  if (!Array.isArray(profileIds) || profileIds.length === 0) {
    throw new AppError('Profile IDs array is required', 400, 'VALIDATION_ERROR');
  }

  const profiles = await SocialProfileModel.find({
    _id: { $in: profileIds },
    detectionStatus: { $ne: 'processing' },
  });

  const results = [];
  
  for (const profile of profiles) {
    try {
      await queueService.queueReelAnalysis(profile._id.toString(), profile.username);
      
      profile.detectionStatus = 'processing';
      await profile.save();
      
      results.push({
        profileId: profile._id,
        username: profile.username,
        status: 'queued',
      });
    } catch (error) {
      results.push({
        profileId: profile._id,
        username: profile.username,
        status: 'failed',
        error: error.message,
      });
    }
  }

  res.json({
    success: true,
    message: `Queued analysis for ${results.filter(r => r.status === 'queued').length} profiles`,
    data: results,
  });
}));