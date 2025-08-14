import { Request, Response, NextFunction } from 'express';
import { AuthUtils, AuthenticationError } from '@anatome-ai/utils';
import { RedisClient } from '../services/redis';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

const redis = RedisClient.getInstance();

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check for header from API Gateway
    const userId = req.headers['x-user-id'] as string;
    const userEmail = req.headers['x-user-email'] as string;
    const userRole = req.headers['x-user-role'] as string;

    if (userId && userEmail && userRole) {
      req.user = {
        id: userId,
        email: userEmail,
        role: userRole,
      };
      return next();
    }

    // Fallback to direct authentication
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.substring(7);

    // Check if token is blacklisted
    const isBlacklisted = await redis.isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new AuthenticationError('Token has been revoked');
    }
    
    try {
      const decoded = AuthUtils.verifyToken(token);
      
      // Check session exists
      const session = await redis.getSession(decoded.id, token);
      if (!session) {
        throw new AuthenticationError('Session expired');
      }

      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
      };
      next();
    } catch (error) {
      throw new AuthenticationError('Invalid or expired token');
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: error.message,
        },
      });
    }
    next(error);
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Authentication required',
        },
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: 'Insufficient permissions',
        },
      });
    }

    next();
  };
};