import { z } from 'zod';

export const validationSchemas = {
  // User schemas
  userSignup: z.object({
    email: z.string().email(),
    password: z.string().min(8).max(100),
    name: z.string().min(2).max(100),
  }),

  userLogin: z.object({
    email: z.string().email(),
    password: z.string(),
  }),

  // Business schemas
  businessCreate: z.object({
    name: z.string().min(2).max(200),
    type: z.string().min(2).max(100),
    location: z.object({
      address: z.string(),
      city: z.string(),
      state: z.string(),
      country: z.string(),
      coordinates: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }).optional(),
    }),
    industry: z.string(),
    website: z.string().url().optional(),
  }),

  businessSearch: z.object({
    name: z.string().optional(),
    location: z.string(),
    radius: z.number().min(1).max(100).default(50),
    type: z.string().optional(),
  }),

  // Social Profile schemas
  socialProfileCreate: z.object({
    businessId: z.string(),
    platform: z.enum(['instagram', 'facebook', 'tiktok']),
    username: z.string(),
    profileUrl: z.string().url(),
  }),

  // Video schemas
  videoAnalysis: z.object({
    videoId: z.string(),
    forceReanalysis: z.boolean().optional(),
  }),

  // Report schemas
  reportGenerate: z.object({
    businessId: z.string(),
    competitorIds: z.array(z.string()).min(1),
    type: z.enum(['competitor-analysis', 'content-strategy', 'performance-metrics']),
  }),

  // Job schemas
  jobCreate: z.object({
    type: z.enum(['business-discovery', 'instagram-detection', 'video-scraping', 'video-analysis', 'report-generation']),
    data: z.any(),
    priority: z.number().min(0).max(10).default(5),
    scheduledAt: z.string().datetime().optional(),
  }),

  // Pagination
  pagination: z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  // ID validation
  mongoId: z.string().regex(/^[0-9a-fA-F]{24}$/),
};

export class Validator {
  static validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
    return schema.parse(data);
  }

  static validatePartial<T>(schema: z.ZodSchema<T>, data: unknown): Partial<T> {
    return schema.partial().parse(data);
  }

  static isValid<T>(schema: z.ZodSchema<T>, data: unknown): boolean {
    return schema.safeParse(data).success;
  }

  static getErrors<T>(schema: z.ZodSchema<T>, data: unknown): z.ZodError | null {
    const result = schema.safeParse(data);
    if (!result.success) {
      return result.error;
    }
    return null;
  }
}