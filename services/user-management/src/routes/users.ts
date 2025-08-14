import { Router } from 'express';
import { asyncHandler, AppError, AuthUtils, createPaginationOptions, createPaginationResponse } from '@anatome-ai/utils';
import { UserModel } from '../models/user';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth';
import { RedisClient } from '../services/redis';

export const userRoutes = Router();
const redis = RedisClient.getInstance();

// Get current user profile
userRoutes.get('/me', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const user = await UserModel.findById(req.user!.id).select('-password -refreshTokens');
  
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  res.json({
    success: true,
    data: user.toJSON(),
  });
}));

// Update current user profile
userRoutes.put('/me', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const allowedUpdates = ['name', 'email'];
  const updates = Object.keys(req.body)
    .filter(key => allowedUpdates.includes(key))
    .reduce((obj, key) => {
      obj[key] = req.body[key];
      return obj;
    }, {} as any);

  if (updates.email) {
    // Check if email is already taken
    const existingUser = await UserModel.findOne({ 
      email: updates.email,
      _id: { $ne: req.user!.id },
    });
    
    if (existingUser) {
      throw new AppError('Email already in use', 409, 'EMAIL_EXISTS');
    }
  }

  const user = await UserModel.findByIdAndUpdate(
    req.user!.id,
    updates,
    { new: true, runValidators: true }
  ).select('-password -refreshTokens');

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Clear cache
  await redis.deleteCache(`user:${req.user!.id}`);

  res.json({
    success: true,
    data: user.toJSON(),
  });
}));

// Change password
userRoutes.post('/me/change-password', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new AppError('Current and new passwords are required', 400, 'VALIDATION_ERROR');
  }

  if (newPassword.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400, 'VALIDATION_ERROR');
  }

  const user = await UserModel.findById(req.user!.id);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Verify current password
  const isValid = await AuthUtils.comparePassword(currentPassword, user.password);
  if (!isValid) {
    throw new AppError('Current password is incorrect', 401, 'INVALID_PASSWORD');
  }

  // Hash and update password
  user.password = await AuthUtils.hashPassword(newPassword);
  
  // Invalidate all refresh tokens
  for (const token of user.refreshTokens) {
    await redis.blacklistToken(token);
  }
  user.refreshTokens = [];
  
  await user.save();

  // Delete all sessions
  await redis.deleteAllUserSessions(req.user!.id);

  res.json({
    success: true,
    message: 'Password changed successfully. Please login again.',
  });
}));

// Delete account
userRoutes.delete('/me', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const { password } = req.body;

  if (!password) {
    throw new AppError('Password is required to delete account', 400, 'VALIDATION_ERROR');
  }

  const user = await UserModel.findById(req.user!.id);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Verify password
  const isValid = await AuthUtils.comparePassword(password, user.password);
  if (!isValid) {
    throw new AppError('Invalid password', 401, 'INVALID_PASSWORD');
  }

  // Blacklist all refresh tokens
  for (const token of user.refreshTokens) {
    await redis.blacklistToken(token);
  }

  // Delete all sessions
  await redis.deleteAllUserSessions(req.user!.id);

  // Delete user
  await user.deleteOne();

  res.json({
    success: true,
    message: 'Account deleted successfully',
  });
}));

// Admin routes
// Get all users (admin only)
userRoutes.get('/', authMiddleware, requireRole(['admin']), asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const { skip } = createPaginationOptions(page, limit);

  const filter: any = {};
  
  if (req.query.role) {
    filter.role = req.query.role;
  }
  
  if (req.query.plan) {
    filter['subscription.plan'] = req.query.plan;
  }

  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .select('-password -refreshTokens')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    UserModel.countDocuments(filter),
  ]);

  const response = createPaginationResponse(
    users.map(u => u.toJSON()),
    total,
    page,
    limit
  );

  res.json({
    success: true,
    ...response,
  });
}));

// Get user by ID (admin only)
userRoutes.get('/:id', authMiddleware, requireRole(['admin']), asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.params.id).select('-password -refreshTokens');
  
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  res.json({
    success: true,
    data: user.toJSON(),
  });
}));

// Update user (admin only)
userRoutes.put('/:id', authMiddleware, requireRole(['admin']), asyncHandler(async (req, res) => {
  const allowedUpdates = ['name', 'email', 'role', 'subscription'];
  const updates = Object.keys(req.body)
    .filter(key => allowedUpdates.includes(key))
    .reduce((obj, key) => {
      obj[key] = req.body[key];
      return obj;
    }, {} as any);

  const user = await UserModel.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true, runValidators: true }
  ).select('-password -refreshTokens');

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Clear cache
  await redis.deleteCache(`user:${req.params.id}`);

  res.json({
    success: true,
    data: user.toJSON(),
  });
}));

// Delete user (admin only)
userRoutes.delete('/:id', authMiddleware, requireRole(['admin']), asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.params.id);
  
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Blacklist all refresh tokens
  for (const token of user.refreshTokens) {
    await redis.blacklistToken(token);
  }

  // Delete all sessions
  await redis.deleteAllUserSessions(req.params.id);

  // Delete user
  await user.deleteOne();

  res.json({
    success: true,
    message: 'User deleted successfully',
  });
}));