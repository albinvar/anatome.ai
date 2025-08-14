# Video Scraping Service

The Video Scraping Service handles Instagram content scraping, video downloads, and file management with sophisticated rate limiting and usage quotas.

## 📋 Overview

**Port**: 8001  
**Technology**: Python, FastAPI, Instaloader  
**Dependencies**: MongoDB, Redis, Backblaze B2/S3, Instagram API  

## 🎯 Responsibilities

- **Instagram Scraping**: Profile and video content extraction
- **Video Downloads**: High-quality video file retrieval
- **File Storage**: Upload to Backblaze B2 or AWS S3
- **Usage Limits**: Subscription-based download quotas
- **Rate Limiting**: Instagram API compliance
- **Session Management**: Persistent Instagram sessions

## 🏗 Architecture

```
[API Request] → [Limits Check] → [Instagram Scraper] → [File Storage]
                      ↓                    ↓               ↓
                 [User Quota]         [Rate Limiter]   [B2/S3 Upload]
                      ↓                    ↓               ↓
                 [MongoDB]              [Redis]        [File URLs]
```

## 📊 Subscription Limits

| Plan | Monthly Videos | Rate Limit | Features |
|------|---------------|------------|----------|
| **Free** | 50 | 30/hour | Basic scraping |
| **Pro** | 200 | 60/hour | Priority processing |
| **Enterprise** | 1000 | 120/hour | Bulk operations |

**Environment Configuration**:
```bash
MAX_VIDEOS_FREE=50
MAX_VIDEOS_PRO=200
MAX_VIDEOS_ENTERPRISE=1000
```

## 🔌 API Endpoints

### Profile Scraping
```http
POST /scrape/profile
```

**Request**:
```json
{
  "username": "restaurant_account",
  "social_profile_id": "profile123",
  "business_id": "business123",
  "max_videos": 20
}
```

**Response**:
```json
{
  "success": true,
  "message": "Started scraping profile @restaurant_account",
  "username": "restaurant_account",
  "max_videos": 20,
  "remaining_quota": 30
}
```

### Single Video Scraping
```http
POST /scrape/video
```

**Parameters**:
- `url`: Instagram video URL
- `business_id`: Target business ID
- `social_profile_id`: Associated profile ID

### Video Management
```http
GET /videos/{business_id}?skip=0&limit=20
DELETE /videos/{video_id}
```

### Usage Tracking
```http
GET /usage          # User's current usage stats
GET /limits         # Subscription tier limits
```

## 🗄️ File Storage (Backblaze B2)

**Configuration**:
```bash
# Backblaze B2 (Primary)
B2_ENDPOINT_URL=https://s3.us-west-002.backblazeb2.com
B2_BUCKET_NAME=anatome-ai-videos
B2_ACCESS_KEY_ID=your_b2_key_id
B2_SECRET_ACCESS_KEY=your_b2_secret

# AWS S3 (Fallback)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
S3_BUCKET_NAME=anatome-ai-videos
```

**Features**:
- **Primary**: Backblaze B2 for cost-effective storage
- **Fallback**: AWS S3 if B2 unavailable  
- **CDN Integration**: CloudFlare integration
- **File Organization**: `videos/{business_id}/{video_id}.mp4`
- **Thumbnails**: `thumbnails/{business_id}/{video_id}.jpg`

## 🚦 Rate Limiting

**Instagram Compliance**:
- **Requests**: 30 per hour (configurable)
- **Delay**: 2 seconds between requests
- **Random Jitter**: 0.5-1.5 seconds additional delay
- **Session Persistence**: Reduce login frequency

**Implementation**:
```python
async def _rate_limit(self):
    # Check hourly limits
    if self.requests_this_hour >= settings.max_requests_per_hour:
        wait_time = 3600 - (current_time - self.hour_start)
        await asyncio.sleep(wait_time)
    
    # Delay between requests
    await asyncio.sleep(settings.delay_between_requests)
    
    # Random human-like delay
    random_delay = random.uniform(0.5, 1.5)
    await asyncio.sleep(random_delay)
```

## 📱 Instagram Integration

**Instaloader Features**:
- **Profile Videos**: Bulk profile content extraction
- **Single Videos**: Individual post downloads
- **Metadata Extraction**: Likes, comments, captions
- **Thumbnail Generation**: High-quality thumbnails
- **Anti-Detection**: Human-like behavior patterns

**Session Management**:
```python
# Session persistence
session_file = "./sessions/instagram_session.json"
loader.load_session_from_file(username, session_file)
```

## 💾 Data Models

**Video Document**:
```javascript
{
  id: "video123",
  socialProfileId: "profile123",
  businessId: "business123",
  videoUrl: "https://instagram.com/p/ABC123/",
  thumbnailUrl: "https://instagram.com/...",
  s3Url: "https://b2.backblazeb2.com/bucket/video.mp4",
  s3ThumbnailUrl: "https://b2.backblazeb2.com/bucket/thumb.jpg",
  caption: "Amazing content!",
  likes: 1500,
  comments: 85,
  shares: 23,
  views: 5000,
  duration: 15.5,
  publishedAt: "2024-01-01T12:00:00Z",
  analysisStatus: "pending",
  createdAt: "2024-01-01T12:05:00Z"
}
```

## 🔐 Usage Limits System

**Quota Checking**:
```python
async def check_video_limit(user_id: str, requested: int):
    subscription = await get_user_subscription(user_id)
    current_count = await get_user_video_count(user_id)
    limit = self.limits[subscription]
    
    return {
        'allowed': (current_count + requested) <= limit,
        'remaining': max(0, limit - current_count),
        'subscription': subscription
    }
```

**Monthly Reset**:
- Counts reset first day of each month
- Usage tracked in MongoDB with timestamps
- Redis caching for performance

## 🏥 Health Monitoring

**Health Check** (`GET /health`):
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "redis": true,
    "instagram": true,
    "s3": true
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**Service Dependencies**:
- **MongoDB**: Video metadata storage
- **Redis**: Rate limiting and caching
- **Instagram**: Content source availability
- **B2/S3**: File storage accessibility

## ⚙️ Configuration

**Environment Variables**:
```bash
# Database
MONGODB_URI=mongodb://localhost:27017/anatome-ai
REDIS_HOST=localhost
REDIS_PORT=6379

# Storage
B2_ENDPOINT_URL=https://s3.us-west-002.backblazeb2.com
B2_BUCKET_NAME=anatome-ai-videos
B2_ACCESS_KEY_ID=your_key
B2_SECRET_ACCESS_KEY=your_secret

# Instagram
INSTAGRAM_USERNAME=your_account
INSTAGRAM_PASSWORD=your_password
INSTAGRAM_SESSION_FILE=./sessions/session.json

# Rate Limiting
MAX_REQUESTS_PER_HOUR=30
DELAY_BETWEEN_REQUESTS=2.0

# Video Limits
MAX_VIDEOS_FREE=50
MAX_VIDEOS_PRO=200
MAX_VIDEOS_ENTERPRISE=1000

# Paths
TEMP_DIR=./temp
SESSIONS_DIR=./sessions
LOG_LEVEL=INFO
```

## 🚀 Development

**Setup**:
```bash
cd services/video-scraping
pip install -r requirements.txt
python main.py
```

**Docker**:
```bash
docker build -t anatome-video-scraping .
docker run -p 8001:8001 anatome-video-scraping
```

## 🧪 Testing

**Unit Tests**:
```bash
pytest tests/test_scraper.py
pytest tests/test_limits.py
```

**Integration Tests**:
```bash
pytest tests/test_api.py -v
```

## 📊 Background Processing

**Profile Scraping Workflow**:
1. Validate user limits
2. Queue background job
3. Extract profile videos
4. Download each video
5. Upload to B2/S3
6. Save metadata to MongoDB
7. Update usage counters

**Error Handling**:
- Retry failed downloads (3 attempts)
- Skip videos that fail repeatedly
- Continue processing remaining videos
- Detailed error logging

## 🔍 Logging

**Log Categories**:
- **API Requests**: Endpoint access and responses
- **Scraping Activity**: Instagram interactions
- **File Operations**: Upload/download status
- **Rate Limiting**: Quota and timing info
- **Errors**: Detailed failure information

**Log Format**:
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "INFO",
  "service": "video-scraping",
  "message": "Video downloaded successfully",
  "video_url": "https://instagram.com/p/ABC123/",
  "user_id": "user123",
  "duration": 2.5,
  "file_size": "5.2MB"
}
```

## 🚨 Error Handling

**Common Errors**:

| Error | Code | Description | Resolution |
|-------|------|-------------|------------|
| Rate limit exceeded | 429 | Too many requests | Wait for reset |
| Quota exceeded | 429 | Monthly limit reached | Upgrade subscription |
| Instagram unavailable | 503 | Profile/video not found | Retry later |
| Storage failed | 503 | B2/S3 upload error | Check credentials |
| Invalid username | 400 | Malformed Instagram handle | Validate input |

## 📈 Performance

**Optimizations**:
- **Async Processing**: Non-blocking I/O operations
- **Connection Pooling**: Efficient database connections
- **File Streaming**: Large file handling
- **Batch Operations**: Multiple video processing
- **Caching**: Metadata and session caching

**Metrics**:
- Average scraping time: 30 seconds per video
- Concurrent downloads: 5 videos
- Success rate: 95%+
- Storage upload time: 15 seconds average

## 🔒 Security

**Data Protection**:
- Instagram session encryption
- Secure credential storage
- File access controls
- User data isolation

**Compliance**:
- Instagram Terms of Service adherence
- Rate limiting enforcement
- Content attribution
- User consent verification

## 📚 API Documentation

**FastAPI Docs**: http://localhost:8001/docs  
**Redoc**: http://localhost:8001/redoc

## 🤝 Contributing

1. Follow Python PEP 8 style guidelines
2. Add comprehensive async error handling
3. Include rate limiting compliance
4. Update usage tracking logic
5. Add appropriate logging and monitoring

## 🔗 Related Services

- [API Gateway](./api-gateway.md) - Request routing and auth
- [Business Discovery](./business-discovery.md) - Profile discovery
- [Video Analysis](./video-analysis.md) - Content analysis
- [File Storage](./file-storage.md) - File management

---

**Next**: [Video Analysis Service](./video-analysis.md)