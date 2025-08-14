import { Router } from 'express';
import { 
  asyncHandler, 
  AppError, 
  validationSchemas, 
  Validator,
  createPaginationOptions,
  createPaginationResponse 
} from '@anatome-ai/utils';
import { BusinessModel } from '../models/business';
import { QueueService } from '../services/queue';

export const businessRoutes = Router();
const queueService = QueueService.getInstance();

// Create business
businessRoutes.post('/', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const data = Validator.validate(validationSchemas.businessCreate, req.body);

  // Check if business already exists for this user
  const existingBusiness = await BusinessModel.findOne({
    userId,
    name: data.name,
    'location.city': data.location.city,
  });

  if (existingBusiness) {
    throw new AppError('Business already exists', 409, 'BUSINESS_EXISTS');
  }

  // Create business
  const business = new BusinessModel({
    ...data,
    userId,
  });

  await business.save();

  // Queue competitor discovery
  await queueService.queueCompetitorDiscovery(business.id);

  // Queue business enrichment
  await queueService.queueBusinessEnrichment(business.id);

  res.status(201).json({
    success: true,
    data: business.toJSON(),
  });
}));

// Get all businesses for user
businessRoutes.get('/', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const { skip } = createPaginationOptions(page, limit);

  const filter: any = { userId };

  if (req.query.industry) {
    filter.industry = req.query.industry;
  }

  if (req.query.city) {
    filter['location.city'] = req.query.city;
  }

  if (req.query.status) {
    filter.discoveryStatus = req.query.status;
  }

  const [businesses, total] = await Promise.all([
    BusinessModel.find(filter)
      .populate('competitors', 'name location.city industry')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    BusinessModel.countDocuments(filter),
  ]);

  const response = createPaginationResponse(
    businesses.map(b => b.toJSON()),
    total,
    page,
    limit
  );

  res.json({
    success: true,
    ...response,
  });
}));

// Get business by ID
businessRoutes.get('/:id', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const business = await BusinessModel.findOne({
    _id: req.params.id,
    userId,
  }).populate('competitors');

  if (!business) {
    throw new AppError('Business not found', 404, 'BUSINESS_NOT_FOUND');
  }

  res.json({
    success: true,
    data: business.toJSON(),
  });
}));

// Update business
businessRoutes.put('/:id', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const allowedUpdates = ['name', 'type', 'location', 'industry', 'website'];
  const updates = Object.keys(req.body)
    .filter(key => allowedUpdates.includes(key))
    .reduce((obj, key) => {
      obj[key] = req.body[key];
      return obj;
    }, {} as any);

  const business = await BusinessModel.findOneAndUpdate(
    { _id: req.params.id, userId },
    updates,
    { new: true, runValidators: true }
  );

  if (!business) {
    throw new AppError('Business not found', 404, 'BUSINESS_NOT_FOUND');
  }

  res.json({
    success: true,
    data: business.toJSON(),
  });
}));

// Delete business
businessRoutes.delete('/:id', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const business = await BusinessModel.findOneAndDelete({
    _id: req.params.id,
    userId,
  });

  if (!business) {
    throw new AppError('Business not found', 404, 'BUSINESS_NOT_FOUND');
  }

  res.json({
    success: true,
    message: 'Business deleted successfully',
  });
}));

// Get competitors for a business
businessRoutes.get('/:id/competitors', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const business = await BusinessModel.findOne({
    _id: req.params.id,
    userId,
  }).populate('competitors');

  if (!business) {
    throw new AppError('Business not found', 404, 'BUSINESS_NOT_FOUND');
  }

  res.json({
    success: true,
    data: business.competitors || [],
  });
}));

// Trigger competitor rediscovery
businessRoutes.post('/:id/rediscover', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const radius = parseInt(req.body.radius) || 50;

  const business = await BusinessModel.findOne({
    _id: req.params.id,
    userId,
  });

  if (!business) {
    throw new AppError('Business not found', 404, 'BUSINESS_NOT_FOUND');
  }

  // Check if discovery is already in progress
  if (business.discoveryStatus === 'discovering') {
    throw new AppError('Discovery already in progress', 409, 'DISCOVERY_IN_PROGRESS');
  }

  // Queue competitor discovery
  await queueService.queueCompetitorDiscovery(business.id, radius);

  // Update status
  business.discoveryStatus = 'discovering';
  await business.save();

  res.json({
    success: true,
    message: 'Competitor rediscovery initiated',
    data: {
      businessId: business.id,
      status: 'discovering',
    },
  });
}));