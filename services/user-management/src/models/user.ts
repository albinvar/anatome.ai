import mongoose, { Schema, Document } from 'mongoose';
import { User } from '@anatome-ai/types';
import { BaseSchema } from '@anatome-ai/utils';

export interface IUser extends Document, Omit<User, 'id'> {
  password: string;
  refreshTokens: string[];
  emailVerified: boolean;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
}

const userSchema = new Schema<IUser>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  refreshTokens: [{
    type: String,
  }],
  resetPasswordToken: String,
  resetPasswordExpires: Date,
}, BaseSchema);

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ 'subscription.plan': 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full user object
userSchema.virtual('isSubscriptionActive').get(function() {
  return this.subscription.expiresAt > new Date();
});

// Remove sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokens;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  obj.id = obj._id;
  delete obj._id;
  delete obj.__v;
  return obj;
};

export const UserModel = mongoose.model<IUser>('User', userSchema);