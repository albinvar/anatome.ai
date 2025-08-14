# Anatome.ai - Complete Microservices Project Setup

## Project Overview

Create a competitive intelligence and content analysis tool called Anatome.ai that helps digital marketing companies analyze local competitor social media strategies. The system discovers local businesses, scrapes their Instagram content, analyzes high-performing videos using AI, and generates comprehensive reports.

## Architecture Requirements

### Microservices Architecture

Build the following independent services:

1. **API Gateway Service** (Node.js + Express)
2. **Business Discovery Service** (Node.js + Express + MongoDB)
3. **Instagram Detection Service** (Node.js + Express + MongoDB)
4. **Video Scraping Service** (Python + FastAPI + Instaloader)
5. **Video Analysis Service** (Node.js + Express + AI APIs)
6. **Report Generation Service** (Node.js + Express + AI APIs)
7. **Analytics Service** (Node.js + Express + MongoDB)
8. **File Storage Service** (Node.js + Express + AWS S3)
9. **Job Queue Service** (Node.js + Bull/Redis)
10. **User Management Service** (Node.js + Express + MongoDB)

### Technology Stack

**Backend Services:**

- Node.js with Express.js and TypeScript
- MongoDB with Mongoose ODM
- Redis for caching and job queues
- JWT authentication with refresh tokens
- Input validation using Zod
- Error handling and logging middleware

**Python Service:**

- FastAPI framework
- Instaloader for Instagram scraping
- Session management and proxy rotation
- S3 integration for file uploads

**AI Integration:**

- Google Gemini API for video content analysis and vision
- Claude Opus/GPT-4 for report generation
- FFmpeg for video processing
- Structured prompt templates and output parsing

**External APIs:**

- Serper.dev for business discovery and Instagram detection
- AWS S3 for video/thumbnail storage
- AWS CloudFront CDN integration

**Infrastructure:**

- Docker containers for each service
- Docker Compose for development environment
- Health check endpoints for all services
- Environment-based configuration

**Frontend (Expo):**

- React Native with TypeScript
- Expo web client with shared components
- React Navigation v6
- Expo AV for video playback
- Victory Native for charts
- AsyncStorage for offline caching

## Core Workflow Implementation

### 1. Business Discovery Flow

- Accept business input (name, location, type)
- Use Serper.dev to find competitors within 40-50km radius
- Store business data with geospatial indexing
- Queue Instagram detection jobs

### 2. Instagram Detection & Scraping

- Search for Instagram profiles using Serper.dev
- Validate and store social media profiles
- Queue video scraping jobs for Python service
- Download videos using Instaloader with rate limiting

### 3. Video Analysis Pipeline

- Extract video frames using FFmpeg
- Analyze content with Gemini Vision API
- Extract metadata and engagement metrics
- Calculate performance indicators and success factors

### 4. Report Generation

- Aggregate analysis data across competitors
- Use Claude Opus/GPT-4 for insights generation
- Create structured reports with actionable recommendations
- Generate PDF exports and dashboard visualizations

## Technical Requirements

### Database Schema (MongoDB)

```javascript
// Collections needed:
- businesses (geospatial data, business info)
- social_profiles (Instagram accounts, verification status)
- videos (metadata, performance metrics, analysis results)
- analyses (AI-generated insights, correlation data)
- reports (generated reports, PDF links)
- users (authentication, subscriptions)
- jobs (queue status, processing logs)
```

### API Endpoints Structure

```
/api/v1/businesses - Business CRUD operations
/api/v1/discovery - Competitor discovery
/api/v1/instagram - Social profile operations
/api/v1/videos - Video management and analysis
/api/v1/analytics - Performance metrics
/api/v1/reports - Report generation and export
/api/v1/auth - Authentication endpoints
/api/v1/jobs - Job status and monitoring
```

### Docker Configuration

- Separate Dockerfile for each service
- Docker Compose with networking between services
- Volume mounts for persistent data
- Environment variable management
- Health checks and restart policies

### Job Queue System

- Bull.js with Redis backend
- Video processing workflows
- Retry mechanisms for failed jobs
- Progress tracking and notifications
- Rate limiting for external APIs

## Security & Compliance

- JWT-based authentication with rotation
- Rate limiting on all endpoints
- Input validation and sanitization
- CORS configuration
- Environment-based secrets management
- Instagram ToS compliance measures

## Development Setup

- TypeScript configuration for Node.js services
- ESLint and Prettier setup
- Jest testing framework
- API documentation with Swagger
- Development and production environment configs

## File Structure

Create a monorepo structure with:

```
anatome-ai/
├── services/
│   ├── api-gateway/
│   ├── business-discovery/
│   ├── instagram-detection/
│   ├── video-scraping/ (Python)
│   ├── video-analysis/
│   ├── report-generation/
│   ├── analytics/
│   ├── file-storage/
│   ├── job-queue/
│   └── user-management/
├── frontend/
│   ├── mobile/ (Expo)
│   └── web/ (Expo Web)
├── shared/
│   ├── types/
│   ├── utils/
│   └── configs/
├── docker-compose.yml
├── docker-compose.prod.yml
└── README.md
```

## Implementation Priority

1. Start with core backend services (API Gateway, Business Discovery, User Management)
2. Implement Instagram Detection and Video Scraping services
3. Add AI analysis and report generation
4. Build frontend interfaces
5. Add monitoring, testing, and deployment configs

## Key Features to Implement

- Geospatial business search and competitor discovery
- Instagram profile detection and validation
- Video scraping with anti-detection measures
- AI-powered content analysis and insights
- Comprehensive report generation
- Real-time job processing and notifications
- Responsive web and mobile interfaces
- PDF export and data visualization

Please create the complete project structure with all services, implementing the core functionality, API endpoints, database schemas, Docker configuration, and frontend interfaces. Focus on production-ready code with proper error handling, logging, and scalability considerations.
