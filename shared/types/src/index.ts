export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  subscription: {
    plan: 'free' | 'pro' | 'enterprise';
    expiresAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Business {
  id: string;
  name: string;
  type: string;
  location: {
    address: string;
    city: string;
    state: string;
    country: string;
    coordinates: {
      lat: number;
      lng: number;
    };
  };
  industry: string;
  website?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialProfile {
  id: string;
  businessId: string;
  platform: 'instagram' | 'facebook' | 'tiktok';
  username: string;
  profileUrl: string;
  verified: boolean;
  followers: number;
  following: number;
  posts: number;
  lastScrapedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Video {
  id: string;
  socialProfileId: string;
  businessId: string;
  videoUrl: string;
  thumbnailUrl: string;
  s3Url?: string;
  s3ThumbnailUrl?: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  views?: number;
  duration: number;
  publishedAt: Date;
  analysisStatus: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoAnalysis {
  id: string;
  videoId: string;
  content: {
    objects: string[];
    scenes: string[];
    text: string[];
    colors: string[];
    emotions: string[];
  };
  engagement: {
    engagementRate: number;
    performanceScore: number;
    viralPotential: number;
  };
  insights: {
    keyFactors: string[];
    recommendations: string[];
    trends: string[];
  };
  aiResponse: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface Report {
  id: string;
  userId: string;
  businessId: string;
  competitorIds: string[];
  type: 'competitor-analysis' | 'content-strategy' | 'performance-metrics';
  status: 'pending' | 'generating' | 'completed' | 'failed';
  data: {
    summary: string;
    insights: any[];
    recommendations: any[];
    metrics: any;
  };
  pdfUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Job {
  id: string;
  type: 'business-discovery' | 'instagram-detection' | 'video-scraping' | 'video-analysis' | 'report-generation';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  priority: number;
  data: any;
  result?: any;
  error?: string;
  attempts: number;
  maxAttempts: number;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  responseTime: number;
  timestamp: Date;
  checks: {
    database?: boolean;
    redis?: boolean;
    external?: boolean;
  };
}