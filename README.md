# Anatome.ai - Competitive Intelligence Platform

A comprehensive microservices-based platform for competitive intelligence and content analysis, helping digital marketing companies analyze local competitor social media strategies.

## 🚀 Quick Start with Docker

### Prerequisites

1. **Docker Desktop** - Install from [docker.com](https://www.docker.com/products/docker-desktop/)
2. **Git** - For version control
3. **API Keys** - Get your API keys (see Configuration section)

### 1. Start Docker Desktop

Make sure Docker Desktop is running on your machine.

### 2. Configuration

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` file with your API keys:
   ```bash
   # Required API Keys
   SERPER_API_KEY=your-serper-api-key-from-serper.dev
   OPENROUTER_API_KEY=your-openrouter-api-key  
   
   # Backblaze B2 (optional for video storage)
   B2_ACCESS_KEY_ID=your-b2-access-key
   B2_SECRET_ACCESS_KEY=your-b2-secret-key
   ```

### 3. Build and Run

#### Option A: Full System
```bash
docker compose up --build
```

#### Option B: Step by Step (Recommended)
```bash
# 1. Start infrastructure first
docker compose up -d mongodb redis

# 2. Wait a few seconds, then start core services
docker compose up -d user-management business-discovery instagram-detection job-queue

# 3. Start API Gateway
docker compose up -d api-gateway

# 4. Start video scraping (optional)
docker compose up -d video-scraping
```

### 4. Access Services

- **API Gateway**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api/docs
- **Job Queue Dashboard**: http://localhost:3009/health
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379

## 🏗️ Service Architecture

```
Port 3000: API Gateway (Main Entry Point)
Port 3002: User Management Service
Port 3001: Business Discovery Service  
Port 3003: Instagram Detection Service
Port 3009: Job Queue Service
Port 8000: Video Scraping Service (Python/FastAPI)

Infrastructure:
Port 27017: MongoDB Database
Port 6379: Redis Cache & Queue
```

## 🚀 Architecture Overview

### Completed Services

#### Core Infrastructure
- **API Gateway Service** (Port 3000) - Request routing, authentication, rate limiting
- **User Management Service** (Port 3001) - JWT auth, user profiles, session management
- **Business Discovery Service** (Port 3002) - Competitor discovery using Serper.dev API
- **Video Scraping Service** (Port 8001) - Instagram video scraping with Instaloader

#### Shared Libraries
- **Types Package** - TypeScript interfaces and data models
- **Utils Package** - Authentication, logging, validation, database utilities

#### Infrastructure Services
- **MongoDB** - Primary database for all services
- **Redis** - Caching, session storage, job queues
- **Docker Compose** - Development environment orchestration

## 📁 Project Structure

```
anatome.ai/
├── services/
│   ├── api-gateway/           # Express.js API Gateway
│   ├── user-management/       # User auth and profiles
│   ├── business-discovery/    # Competitor discovery
│   ├── video-scraping/        # Python/FastAPI Instagram scraper
│   ├── instagram-detection/   # [Pending] Social profile detection
│   ├── video-analysis/        # [Pending] AI video analysis
│   ├── report-generation/     # [Pending] AI report generation
│   ├── analytics/            # [Pending] Performance analytics
│   ├── file-storage/         # [Pending] AWS S3 file management
│   └── job-queue/            # [Pending] Background job processing
├── shared/
│   ├── types/                # TypeScript type definitions
│   ├── utils/                # Shared utilities and middleware
│   └── configs/              # Configuration files
├── frontend/
│   ├── mobile/               # [Pending] React Native Expo app
│   └── web/                  # [Pending] Expo web client
└── docker-compose.yml        # Development orchestration
```

## 🛠 Technology Stack

### Backend Services
- **Node.js** with Express.js and TypeScript
- **Python** with FastAPI for video scraping
- **MongoDB** with Mongoose ODM
- **Redis** for caching and job queues
- **JWT** authentication with refresh tokens
- **Docker** for containerization

### External APIs & Services
- **Serper.dev** - Business discovery and competitor search
- **Instaloader** - Instagram content scraping
- **AWS S3** - Video and image storage
- **Google Gemini API** - [Ready for] Video content analysis
- **OpenAI/Anthropic APIs** - [Ready for] Report generation

## 🚀 Getting Started

### Prerequisites
- Docker and Docker Compose
- Node.js 20+ (for development)
- Python 3.11+ (for video scraping service)

### Environment Setup

1. Copy environment template:
```bash
cp .env.example .env
```

2. Configure required environment variables:
```env
# MongoDB
MONGODB_URI=mongodb://admin:password@localhost:27017/anatome-ai

# JWT Secrets
JWT_SECRET=your-secret-key-change-this
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this

# External APIs
SERPER_API_KEY=your-serper-api-key
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
S3_BUCKET_NAME=anatome-ai-videos
```

### Development Setup

1. Start all services:
```bash
npm run dev
# or
docker-compose up
```

2. Services will be available at:
- API Gateway: http://localhost:3000
- User Management: http://localhost:3001
- Business Discovery: http://localhost:3002
- Video Scraping: http://localhost:8001

## 📖 API Documentation

### Authentication Flow

1. **Register User**
```bash
POST /api/v1/auth/register
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

2. **Login**
```bash
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Business Discovery

1. **Create Business**
```bash
POST /api/v1/businesses
Authorization: Bearer <access_token>
{
  "name": "My Restaurant",
  "type": "restaurant",
  "location": {
    "address": "123 Main St",
    "city": "New York",
    "state": "NY",
    "country": "USA"
  },
  "industry": "food-service"
}
```

2. **Discover Competitors**
```bash
POST /api/v1/businesses/{id}/rediscover
Authorization: Bearer <access_token>
{
  "radius": 50
}
```

### Video Scraping

1. **Scrape Instagram Profile**
```bash
POST /api/v1/scraping/profile
Authorization: Bearer <access_token>
{
  "username": "restaurant_account",
  "social_profile_id": "profile_id",
  "business_id": "business_id",
  "max_videos": 20
}
```

## 🏗 Service Details

### API Gateway Service
- Express.js with TypeScript
- JWT token validation
- Request routing to microservices
- Rate limiting and CORS
- Health check aggregation
- User context forwarding

**Key Features:**
- Service discovery and load balancing
- Centralized authentication
- Request/response logging
- Error handling and circuit breaking

### User Management Service
- Complete authentication system
- JWT with refresh token rotation
- Redis session management
- Role-based access control
- Password security with bcrypt

**Key Features:**
- User registration and login
- Token refresh mechanism
- Session invalidation
- Password change and account deletion
- Admin user management

### Business Discovery Service
- Serper.dev API integration
- Competitor discovery within radius
- Business data enrichment
- Geospatial search capabilities
- Background job processing with Bull

**Key Features:**
- Automatic competitor discovery
- Business profile enrichment
- Location-based search
- Queue management for API rate limiting
- Market analysis capabilities

### Video Scraping Service (Python)
- FastAPI framework
- Instaloader for Instagram scraping
- AWS S3 integration
- Rate limiting and anti-detection
- Async video processing

**Key Features:**
- Profile video extraction
- Single video scraping
- S3 upload management
- Session persistence
- Rate limiting compliance

## 🔧 Shared Libraries

### Types Package (`@anatome-ai/types`)
Complete TypeScript definitions for:
- User and authentication models
- Business and location data
- Social profiles and videos
- API responses and pagination
- Service health checks

### Utils Package (`@anatome-ai/utils`)
Shared utilities including:
- Authentication helpers (JWT, bcrypt)
- Database connection management
- Validation schemas with Zod
- Error handling classes
- Logging configuration

## 🐳 Docker Configuration

### Development Environment
- MongoDB with authentication
- Redis for caching
- All services with hot reload
- Volume mounts for development
- Network isolation

### Production Ready
- Health checks for all services
- Resource limits
- Non-root user execution
- Multi-stage builds
- Optimized layers

## 🔐 Security Features

### Authentication & Authorization
- JWT with secure secrets
- Refresh token rotation
- Session management
- Role-based access control
- Token blacklisting

### API Security
- Rate limiting per endpoint
- CORS configuration
- Helmet security headers
- Input validation with Zod
- SQL injection prevention

### Data Protection
- Password hashing with bcrypt
- Sensitive data exclusion
- Environment variable management
- Session encryption

## 📊 Monitoring & Health Checks

### Health Check System
Each service exposes `/health` endpoint with:
- Service status
- Database connectivity
- External API availability
- Resource utilization
- Uptime information

### Logging
- Structured logging with Winston
- Request/response logging
- Error tracking
- Service correlation IDs
- Log rotation and retention

## 🚀 Deployment

### Docker Compose Production
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables
All services support environment-based configuration:
- Database connections
- API keys and secrets
- Service discovery
- Feature flags
- Resource limits

## 📈 Performance Considerations

### Database Optimization
- Proper indexing strategy
- Connection pooling
- Query optimization
- Geospatial indexing for location searches

### Caching Strategy
- Redis for session storage
- API response caching
- Database query caching
- CDN for static assets

### Rate Limiting
- Per-user rate limiting
- API-specific limits
- Distributed rate limiting with Redis
- Graceful degradation

## 🔄 Development Workflow

### Code Standards
- TypeScript strict mode
- ESLint configuration
- Prettier formatting
- Git hooks for quality

### Testing Strategy
- Unit tests with Jest
- Integration tests
- API endpoint testing
- Docker health checks

## 📝 API Rate Limits

### Instagram Scraping
- 30 requests per hour (configurable)
- 2-second delay between requests
- Session persistence
- Proxy rotation support

### Serper.dev Integration
- Respects API rate limits
- Queue-based processing
- Retry mechanism
- Error handling

## 🛣 Roadmap

### Immediate Next Steps
1. Instagram Detection Service - Profile validation and discovery
2. Video Analysis Service - AI-powered content analysis
3. Report Generation Service - Comprehensive competitor reports
4. Job Queue Service - Centralized background processing
5. Frontend Development - React Native mobile app

### Future Enhancements
- Real-time analytics dashboard
- Advanced AI insights
- Multi-platform social media support
- White-label solution
- API monetization

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Follow coding standards
4. Add comprehensive tests
5. Update documentation
6. Submit pull request

## 📄 License

MIT License - see LICENSE file for details

---

**Note:** This is a comprehensive competitive intelligence platform designed for marketing agencies and businesses to analyze their competitors' social media strategies. The system is built with scalability, security, and performance in mind.