import { Router } from 'express';
import { AuthUtils, validationSchemas, Validator, AppError, asyncHandler } from '@anatome-ai/utils';
import { UserModel } from '../models/user';
import { RedisClient } from '../services/redis';
import { authMiddleware } from '../middleware/auth';

export const authRoutes = Router();
const redis = RedisClient.getInstance();

// Register
authRoutes.post('/register', asyncHandler(async (req, res) => {
  const data = Validator.validate(validationSchemas.userSignup, req.body);
  
  // Check if user exists
  const existingUser = await UserModel.findOne({ email: data.email });
  if (existingUser) {
    throw new AppError('User already exists', 409, 'USER_EXISTS');
  }

  // Hash password
  const hashedPassword = await AuthUtils.hashPassword(data.password);

  // Create user
  const user = new UserModel({
    email: data.email,
    password: hashedPassword,
    name: data.name,
  });

  await user.save();

  // Generate tokens
  const tokens = AuthUtils.generateTokens(user.toJSON());

  // Store refresh token
  user.refreshTokens.push(tokens.refreshToken);
  await user.save();

  // Set session in Redis
  await redis.setSession(user.id, tokens.accessToken, tokens.expiresIn);

  res.status(201).json({
    success: true,
    data: {
      user: user.toJSON(),
      tokens,
    },
  });
}));

// Login
authRoutes.post('/login', asyncHandler(async (req, res) => {
  const data = Validator.validate(validationSchemas.userLogin, req.body);

  // Find user
  const user = await UserModel.findOne({ email: data.email });
  if (!user) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  // Verify password
  const isValid = await AuthUtils.comparePassword(data.password, user.password);
  if (!isValid) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  // Generate tokens
  const tokens = AuthUtils.generateTokens(user.toJSON());

  // Store refresh token
  user.refreshTokens.push(tokens.refreshToken);
  await user.save();

  // Set session in Redis
  await redis.setSession(user.id, tokens.accessToken, tokens.expiresIn);

  res.json({
    success: true,
    data: {
      user: user.toJSON(),
      tokens,
    },
  });
}));

// Refresh token
authRoutes.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError('Refresh token required', 400, 'TOKEN_REQUIRED');
  }

  // Check if token is blacklisted
  const isBlacklisted = await redis.isTokenBlacklisted(refreshToken);
  if (isBlacklisted) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_TOKEN');
  }

  // Verify refresh token
  let decoded;
  try {
    decoded = AuthUtils.verifyToken(refreshToken, true);
  } catch {
    throw new AppError('Invalid refresh token', 401, 'INVALID_TOKEN');
  }

  // Find user and verify refresh token exists
  const user = await UserModel.findById(decoded.id);
  if (!user || !user.refreshTokens.includes(refreshToken)) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_TOKEN');
  }

  // Remove old refresh token
  user.refreshTokens = user.refreshTokens.filter(token => token !== refreshToken);

  // Generate new tokens
  const tokens = AuthUtils.generateTokens(user.toJSON());

  // Store new refresh token
  user.refreshTokens.push(tokens.refreshToken);
  await user.save();

  // Blacklist old refresh token
  await redis.blacklistToken(refreshToken);

  // Set new session
  await redis.setSession(user.id, tokens.accessToken, tokens.expiresIn);

  res.json({
    success: true,
    data: {
      tokens,
    },
  });
}));

// Logout
authRoutes.post('/logout', authMiddleware, asyncHandler(async (req: any, res) => {
  const { refreshToken } = req.body;
  const userId = req.user.id;

  if (refreshToken) {
    // Blacklist refresh token
    await redis.blacklistToken(refreshToken);

    // Remove from user's tokens
    await UserModel.findByIdAndUpdate(userId, {
      $pull: { refreshTokens: refreshToken },
    });
  }

  // Delete session
  const token = req.headers.authorization?.substring(7);
  if (token) {
    await redis.deleteSession(userId, token);
    await redis.blacklistToken(token);
  }

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
}));

// Logout all devices
authRoutes.post('/logout-all', authMiddleware, asyncHandler(async (req: any, res) => {
  const userId = req.user.id;

  // Get user and blacklist all refresh tokens
  const user = await UserModel.findById(userId);
  if (user) {
    for (const token of user.refreshTokens) {
      await redis.blacklistToken(token);
    }

    // Clear all refresh tokens
    user.refreshTokens = [];
    await user.save();
  }

  // Delete all sessions
  await redis.deleteAllUserSessions(userId);

  res.json({
    success: true,
    message: 'Logged out from all devices',
  });
}));

// Verify token
authRoutes.get('/verify', authMiddleware, asyncHandler(async (req: any, res) => {
  const user = await UserModel.findById(req.user.id).select('-password -refreshTokens');
  
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  res.json({
    success: true,
    data: {
      user: user.toJSON(),
    },
  });
}));