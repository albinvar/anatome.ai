# Job Queue Service

The Job Queue Service is the central orchestrator for all background processing in Anatome.ai. It manages distributed job processing, scheduling, monitoring, and provides a unified API for queue operations across all microservices.

## 📋 Overview

**Port**: 3009  
**Technology**: Node.js, Express.js, TypeScript, Bull Queue, Redis  
**Dependencies**: MongoDB, Redis, All other microservices  

## 🎯 Core Responsibilities

- **Job Orchestration**: Central management of all background tasks
- **Queue Management**: Multiple specialized queues for different job types
- **Job Scheduling**: Delayed and recurring job scheduling with cron support
- **Progress Tracking**: Real-time job status and progress monitoring
- **Error Handling**: Comprehensive retry mechanisms and failure recovery
- **Performance Monitoring**: Queue metrics, processing rates, and health monitoring
- **Service Coordination**: Inter-service job routing and dependency management

## 🏗 Architecture

```
[API Gateway] → [Job Queue Service] → [Queue Manager]
       ↓                ↓                    ↓
[Job Scheduler]    [Bull Queues]        [Redis Cluster]
       ↓                ↓                    ↓
[MongoDB Jobs]     [Workers Pool]      [Service APIs]
       ↓                ↓                    ↓
[Health Monitor]   [Progress Track]   [Result Storage]
```

## 🔄 Queue Types & Job Flows

### Business Discovery Queue
```
Business Search → Competitor Discovery → Instagram Detection → Profile Creation
```

### Instagram Detection Queue
```
Profile Discovery → Reel Analysis → Top Reel Selection → Video Queue Trigger
```

### Video Processing Queue
```
Video Download → Content Analysis → AI Processing → Report Generation
```

### System Maintenance Queue
```
Health Checks → Cleanup Jobs → Archive Old Data → Performance Monitoring
```

## 🗄️ Data Models

### Job Model
```javascript
{
  jobId: String,           // Unique job identifier
  queue: String,           // Queue name (business-discovery, instagram-detection, etc.)
  type: String,            // Job type (discover-competitors, analyze-reels, etc.)
  data: Object,            // Job payload and parameters
  userId: String,          // User who initiated the job
  status: String,          // waiting | active | completed | failed | stalled
  priority: Number,        // Job priority (higher = more important)
  attempts: Number,        // Current attempt count
  maxAttempts: Number,     // Maximum retry attempts
  delay: Number,           // Delay before processing (ms)
  result: Object,          // Job result data
  error: String,           // Error message if failed
  processingTime: Number,  // Processing duration (ms)
  createdAt: Date,         // Job creation time
  startedAt: Date,         // Processing start time
  completedAt: Date,       // Completion time
  failedAt: Date,          // Failure time
}
```

### Queue Model
```javascript
{
  name: String,            // Queue name
  description: String,     // Queue description
  isActive: Boolean,       // Queue active status
  totalJobs: Number,       // Total jobs processed
  completedJobs: Number,   // Successfully completed jobs
  failedJobs: Number,      // Failed jobs
  activeJobs: Number,      // Currently processing jobs
  waitingJobs: Number,     // Jobs waiting for processing
  delayedJobs: Number,     // Delayed jobs
  processingRate: Number,  // Jobs per minute
  averageProcessingTime: Number, // Average processing time (ms)
  lastProcessedAt: Date,   // Last job completion time
  configuration: {
    concurrency: Number,   // Concurrent job limit
    retryAttempts: Number, // Default retry attempts
    retryDelay: Number,    // Default retry delay (ms)
    removeOnComplete: Number, // Keep N completed jobs
    removeOnFail: Number,  // Keep N failed jobs
  },
  healthStatus: String,    // healthy | warning | error
  lastHealthCheck: Date,   // Last health check time
}
```

## 🔌 API Endpoints

### Job Management

#### Create Job
```http
POST /jobs
```

**Request**:
```json
{
  "queue": "business-discovery",
  "type": "discover-with-instagram",
  "data": {
    "businessName": "Downtown Restaurant",
    "location": "New York, NY",
    "businessType": "restaurant",
    "radius": 50
  },
  "options": {
    "priority": 5,
    "attempts": 3,
    "delay": 0
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "jobId": "job_1704067200000_abc123",
    "queue": "business-discovery",
    "type": "discover-with-instagram",
    "status": "waiting",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Get Job Status
```http
GET /jobs/{jobId}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "jobId": "job_1704067200000_abc123",
    "queue": "business-discovery",
    "type": "discover-with-instagram",
    "status": "completed",
    "progress": 100,
    "data": { "businessName": "Downtown Restaurant" },
    "result": {
      "success": true,
      "data": { "businessesFound": 25 },
      "processingTime": 45000
    },
    "attempts": 1,
    "maxAttempts": 3,
    "processingTime": 45000,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "completedAt": "2024-01-01T00:00:45.000Z"
  }
}
```

#### Get User Jobs
```http
GET /jobs/user/{userId}?page=1&limit=20&status=completed&queue=instagram-detection
```

#### Cancel Job
```http
DELETE /jobs/{jobId}
```

#### Retry Failed Job
```http
POST /jobs/{jobId}/retry
```

### Queue Operations

#### Get All Queues
```http
GET /queues
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "name": "business-discovery",
      "description": "Business and competitor discovery jobs",
      "isActive": true,
      "liveStats": {
        "waiting": 3,
        "active": 2,
        "completed": 150,
        "failed": 5,
        "total": 160
      },
      "healthStatus": "healthy",
      "processingRate": 12.5,
      "averageProcessingTime": 30000,
      "lastProcessedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Get Queue Details
```http
GET /queues/{queueName}
```

#### Get Queue Jobs
```http
GET /queues/{queueName}/jobs?status=failed&page=1&limit=50
```

#### Pause/Resume Queue
```http
POST /queues/{queueName}/pause
POST /queues/{queueName}/resume
```

#### Clean Queue
```http
POST /queues/{queueName}/clean
```

**Request**:
```json
{
  "olderThan": 86400000,
  "status": "completed"
}
```

#### Get Queue Metrics
```http
GET /queues/{queueName}/metrics?hours=24
```

### Job Scheduler

#### Get Scheduler Stats
```http
GET /scheduler/stats
```

**Response**:
```json
{
  "success": true,
  "data": {
    "scheduledJobsCount": 5,
    "scheduledJobs": [
      "cleanup-expired-jobs",
      "health-check-services",
      "update-queue-stats"
    ],
    "queueHealth": [
      {
        "name": "business-discovery",
        "healthStatus": "healthy",
        "processingRate": 12.5,
        "totalJobs": 160
      }
    ],
    "uptime": 86400,
    "lastHealthCheck": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Schedule Delayed Job
```http
POST /scheduler/delayed
```

**Request**:
```json
{
  "queue": "video-analysis",
  "type": "analyze-video-content",
  "data": {
    "videoId": "video123",
    "analysisType": "comprehensive"
  },
  "delayMs": 300000
}
```

#### Schedule Repeating Job (Admin Only)
```http
POST /scheduler/repeating
```

**Request**:
```json
{
  "queue": "cleanup",
  "type": "cleanup-expired-jobs",
  "data": {
    "olderThanDays": 30
  },
  "cronExpression": "0 2 * * *",
  "description": "Daily cleanup of expired jobs"
}
```

#### Trigger Manual Job
```http
POST /scheduler/jobs/{jobName}/trigger
```

### Health & Monitoring

#### System Health
```http
GET /health
```

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 86400,
  "checks": {
    "database": true,
    "redis": true,
    "queues": true,
    "memory": true
  },
  "details": {
    "queues": 8,
    "memory": {
      "heapUsed": 45,
      "heapTotal": 128,
      "usage": "35.16%"
    }
  }
}
```

#### Detailed Health Check (Admin)
```http
GET /health/detailed
```

#### Queue Health Summary
```http
GET /scheduler/health
```

#### System Metrics
```http
GET /scheduler/metrics
```

## ⚡ Job Processing Workflows

### Complete Business Discovery Flow
```typescript
// 1. User initiates discovery
POST /jobs
{
  "queue": "business-discovery",
  "type": "discover-with-instagram",
  "data": { "businessName": "Restaurant", "location": "NYC" }
}

// 2. Business Discovery processes
// - Finds competitors using Serper Places API
// - Detects Instagram profiles
// - Creates profiles in Instagram Detection Service

// 3. Auto-triggers Instagram Analysis
{
  "queue": "instagram-detection", 
  "type": "analyze-reels",
  "data": { "profileId": "profile123", "username": "restaurant_nyc" }
}

// 4. Instagram service analyzes reels and queues video scraping
{
  "queue": "video-scraping",
  "type": "scrape-instagram-videos", 
  "data": { "profileId": "profile123", "topReels": [...] }
}

// 5. Video scraping downloads videos and queues analysis
{
  "queue": "video-analysis",
  "type": "analyze-video-content",
  "data": { "videoId": "video123", "videoPath": "s3://..." }
}

// 6. Finally triggers report generation
{
  "queue": "report-generation",
  "type": "generate-competitor-report",
  "data": { "businessId": "biz123", "analysisData": [...] }
}
```

### Error Handling & Retries
- **Automatic Retries**: Jobs retry with exponential backoff
- **Circuit Breaker**: Failing services get temporary circuit breaker
- **Dead Letter Queue**: Permanently failed jobs go to dead letter queue
- **Manual Intervention**: Admins can retry, cancel, or debug failed jobs

## 📊 Job Types by Service

### Business Discovery Jobs
- `discover-competitors`: Find competitor businesses in area
- `discover-with-instagram`: Complete discovery + Instagram detection flow
- `validate-business`: Verify business information

### Instagram Detection Jobs  
- `detect-instagram-profiles`: Find Instagram profiles for businesses
- `analyze-reels`: Extract and rank top-performing reels
- `validate-instagram-profile`: Verify Instagram account exists

### Video Scraping Jobs
- `scrape-instagram-videos`: Download identified top reels
- `download-video`: Download specific video by URL
- `upload-to-storage`: Upload downloaded video to S3/Backblaze

### Video Analysis Jobs
- `analyze-video-content`: AI analysis of video content using Gemini
- `extract-metadata`: Extract technical video metadata
- `generate-insights`: Create insights from analysis data

### Report Generation Jobs
- `generate-competitor-report`: Create comprehensive competitor analysis
- `generate-trend-analysis`: Analyze trends across multiple videos
- `export-pdf-report`: Generate PDF export of analysis

### System Jobs
- `cleanup-expired-jobs`: Remove old completed/failed jobs
- `health-check-services`: Monitor service health
- `backup-data`: Backup critical job data
- `send-notification`: Send user notifications

## ⚙️ Configuration

### Environment Variables
```bash
# Server
PORT=3009
NODE_ENV=production

# Database
MONGODB_URI=mongodb://localhost:27017/anatome-ai
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Service URLs (for job processors)
BUSINESS_DISCOVERY_SERVICE_URL=http://business-discovery:3001
INSTAGRAM_SERVICE_URL=http://instagram-detection:3003
VIDEO_SCRAPING_SERVICE_URL=http://video-scraping:8000
VIDEO_ANALYSIS_SERVICE_URL=http://video-analysis:3005
REPORT_SERVICE_URL=http://report-generation:3006

# Queue Configuration
DEFAULT_JOB_ATTEMPTS=3
DEFAULT_JOB_DELAY=0
MAX_CONCURRENT_JOBS=10
CLEANUP_INTERVAL_HOURS=24
HEALTH_CHECK_INTERVAL_MINUTES=5

# Performance
MAX_JOBS_PER_QUEUE=1000
REMOVE_COMPLETED_AFTER=100
REMOVE_FAILED_AFTER=50
```

### Queue Configurations
```javascript
// Default configuration per queue
{
  "business-discovery": {
    concurrency: 5,
    retryAttempts: 3,
    retryDelay: 2000
  },
  "instagram-detection": {
    concurrency: 3, // Lower due to rate limiting
    retryAttempts: 5,
    retryDelay: 5000
  },
  "video-scraping": {
    concurrency: 2, // Resource intensive
    retryAttempts: 3,
    retryDelay: 10000
  },
  "video-analysis": {
    concurrency: 2, // AI processing intensive
    retryAttempts: 2,
    retryDelay: 30000
  }
}
```

## 🔍 Monitoring & Alerting

### Key Metrics
- **Throughput**: Jobs processed per minute by queue
- **Success Rate**: Percentage of jobs completing successfully
- **Processing Time**: Average and P95 processing times
- **Queue Depth**: Number of waiting jobs per queue
- **Error Rate**: Failed jobs percentage by type
- **Resource Usage**: Memory, CPU, Redis connections

### Health Checks
- **Service Connectivity**: All microservice endpoints accessible
- **Queue Status**: No queues stalled or experiencing high failure rates
- **Database Health**: MongoDB and Redis connections stable
- **Memory Usage**: Service memory usage under limits
- **Processing Lag**: No significant delays in job processing

### Alerts
- High failure rate (>10% failures in past hour)
- Queue depth exceeding thresholds (>100 waiting jobs)
- Service connectivity issues
- Memory usage above 85%
- Processing delays (jobs taking >2x average time)

## 🚀 Development

### Setup
```bash
cd services/job-queue
npm install
npm run dev
```

### Testing
```bash
npm test
npm run test:integration
```

### Docker
```bash
docker build -t anatome-job-queue .
docker run -p 3009:3009 anatome-job-queue
```

## 🧪 Testing Jobs

### Create Test Job
```bash
curl -X POST http://localhost:3009/jobs \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user-123" \
  -d '{
    "queue": "business-discovery",
    "type": "discover-competitors", 
    "data": {
      "businessId": "test123",
      "businessName": "Test Restaurant"
    }
  }'
```

### Monitor Job Progress
```bash
# Get job status
curl http://localhost:3009/jobs/job_1704067200000_abc123 \
  -H "x-user-id: test-user-123"

# Get queue stats
curl http://localhost:3009/queues/business-discovery \
  -H "x-user-role: admin"
```

## 📚 Integration Examples

### Business Discovery Integration
```typescript
// In Business Discovery Service
import axios from 'axios';

const queueJob = async (jobData: any) => {
  await axios.post(`${JOB_QUEUE_URL}/jobs`, {
    queue: 'instagram-detection',
    type: 'detect-instagram-profiles',
    data: jobData
  }, {
    headers: { 'x-user-id': userId }
  });
};
```

### Job Status Monitoring
```typescript
// Frontend job monitoring
const monitorJob = async (jobId: string) => {
  const response = await fetch(`/api/v1/jobs/${jobId}`);
  const { data } = await response.json();
  
  if (data.status === 'completed') {
    console.log('Job completed:', data.result);
  } else if (data.status === 'failed') {
    console.log('Job failed:', data.error);
  } else {
    // Poll again after delay
    setTimeout(() => monitorJob(jobId), 5000);
  }
};
```

## 🤝 Service Dependencies

- **MongoDB**: Job and queue metadata storage
- **Redis**: Queue backend and caching
- **Business Discovery Service**: Business and competitor discovery jobs
- **Instagram Detection Service**: Instagram profile and reel analysis jobs  
- **Video Scraping Service**: Video download and storage jobs
- **Video Analysis Service**: AI-powered video analysis jobs
- **Report Generation Service**: Report creation and export jobs

## 🔗 Related Documentation

- [Business Discovery Service](./business-discovery.md) - Initiates discovery workflows
- [Instagram Detection Service](./instagram-detection.md) - Processes Instagram analysis jobs
- [Video Scraping Service](./video-scraping.md) - Handles video download jobs
- [Video Analysis Service](./video-analysis.md) - Processes AI analysis jobs
- [API Gateway](./api-gateway.md) - Routes job management requests

---

**Next**: [Video Analysis Service](./video-analysis.md)