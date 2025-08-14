import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, AuthTokens } from '@anatome-ai/types';

export class AuthUtils {
  static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateTokens(user: Partial<User>): AuthTokens {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRY || '15m' }
    );

    const refreshToken = jwt.sign(
      payload,
      process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  static verifyToken(token: string, isRefresh = false): any {
    const secret = isRefresh
      ? process.env.JWT_REFRESH_SECRET || 'refresh-secret'
      : process.env.JWT_SECRET || 'secret';
    
    return jwt.verify(token, secret);
  }

  static decodeToken(token: string): any {
    return jwt.decode(token);
  }
}