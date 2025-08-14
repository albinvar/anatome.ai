# API Gateway Service

The API Gateway serves as the single entry point for all client requests, providing authentication, rate limiting, request routing, and service orchestration.

## 📋 Overview

**Port**: 3000  
**Technology**: Node.js, Express.js, TypeScript  
**Dependencies**: JWT, Redis, Rate Limiting  

## 🎯 Responsibilities

- **Request Routing**: Route requests to appropriate microservices
- **Authentication**: Validate JWT tokens and user sessions
- **Rate Limiting**: Protect services from abuse and overload
- **CORS Handling**: Manage cross-origin requests
- **Health Aggregation**: Monitor and report system health
- **Request/Response Logging**: Centralized logging and monitoring

## 🏗 Architecture

```
[Client] → [API Gateway] → [Microservices]
             ↓
        [Authentication]
        [Rate Limiting]
        [Request Logging]
        [Service Discovery]
```

## 🔌 Service Routes

| Path | Target Service | Auth Required |
|------|---------------|---------------|
| `/api/v1/auth/**` | User Management | ❌ |
| `/api/v1/users/**` | User Management | ✅ |
| `/api/v1/businesses/**` | Business Discovery | ✅ |
| `/api/v1/discovery/**` | Business Discovery | ✅ |
| `/api/v1/instagram/**` | Instagram Detection | ✅ |
| `/api/v1/videos/**` | Video Analysis | ✅ |
| `/api/v1/scraping/**` | Video Scraping | ✅ |
| `/api/v1/analytics/**` | Analytics | ✅ |
| `/api/v1/reports/**` | Report Generation | ✅ |
| `/api/v1/files/**` | File Storage | ✅ |
| `/api/v1/jobs/**` | Job Queue | ✅ |

## 🔐 Authentication Flow

1. Client sends request with `Authorization: Bearer <token>`
2. Gateway validates JWT token
3. User context forwarded via headers:
   - `X-User-Id`: User ID
   - `X-User-Email`: User email
   - `X-User-Role`: User role

## ⚡ Rate Limiting

**Configuration**:
- Window: 15 minutes (configurable)
- Max Requests: 100 per window (configurable)
- Applied to: All `/api/**` routes
- Storage: Redis-based distributed limiting

**Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## 🏥 Health Checks

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "services": [
    {
      "service": "user-management",
      "status": "healthy",
      "responseTime": 50
    }
  ],
  "gateway": {
    "uptime": 3600,
    "memory": {...},
    "environment": "development"
  }
}
```

**Health States**:
- `healthy`: All services operational
- `degraded`: Some services experiencing issues
- `unhealthy`: Critical services down

## 📝 Configuration

**Environment Variables**:
```bash
# Server
PORT=3000
NODE_ENV=development

# Rate Limiting
RATE_LIMIT_WINDOW=15          # Minutes
RATE_LIMIT_MAX_REQUESTS=100   # Per window

# Service Discovery
USER_MANAGEMENT_HOST=user-management
USER_MANAGEMENT_PORT=3001
BUSINESS_DISCOVERY_HOST=business-discovery
BUSINESS_DISCOVERY_PORT=3002
# ... other services

# Security
JWT_SECRET=your-secret-key
ALLOWED_ORIGINS=http://localhost:3000,https://app.anatome.ai
```

## 🔍 Logging

**Log Levels**:
- `INFO`: Request routing, service health
- `WARN`: Rate limit hits, service degradation
- `ERROR`: Authentication failures, service errors

**Log Format**:
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "info",
  "service": "api-gateway",
  "message": "Request routed",
  "method": "GET",
  "path": "/api/v1/users/me",
  "statusCode": 200,
  "responseTime": 45,
  "userId": "user123"
}
```

## 🛠 Development

**Start Service**:
```bash
cd services/api-gateway
npm install
npm run dev
```

**Docker**:
```bash
docker build -t anatome-api-gateway .
docker run -p 3000:3000 anatome-api-gateway
```

## 🧪 Testing

**Unit Tests**:
```bash
npm test
```

**Integration Tests**:
```bash
npm run test:integration
```

**Load Testing**:
```bash
# Install artillery
npm install -g artillery

# Run load test
artillery run test/load-test.yml
```

## 📊 Monitoring

**Metrics**:
- Request count and response times
- Error rates by service
- Authentication success/failure rates
- Rate limit hit rates

**Dashboards**:
- Service response times
- Error rate trending
- Authentication metrics
- Rate limiting statistics

## 🚨 Error Handling

**Common Errors**:

| Code | Status | Description |
|------|--------|-------------|
| `AUTHENTICATION_ERROR` | 401 | Invalid or missing token |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `SERVICE_UNAVAILABLE` | 503 | Downstream service error |
| `NOT_FOUND` | 404 | Endpoint not found |

**Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests from this IP"
  }
}
```

## 🔧 Proxy Configuration

**Features**:
- Request/response transformation
- Header forwarding
- Error handling and retry
- Circuit breaker pattern
- Service discovery

**Proxy Options**:
```typescript
{
  target: 'http://service:port',
  changeOrigin: true,
  pathRewrite: { '^/api/v1/path': '' },
  onError: (err, req, res) => {
    // Handle service errors
  },
  onProxyReq: (proxyReq, req) => {
    // Forward user context
  }
}
```

## 📈 Performance

**Optimizations**:
- Connection pooling to downstream services
- Response caching for static data
- Compression middleware
- Request deduplication

**Benchmarks**:
- Average response time: <100ms
- Throughput: 1000+ requests/second
- Error rate: <0.1%

## 🔄 Circuit Breaker

**Implementation**:
- Automatic service failure detection
- Fallback responses during outages
- Gradual recovery and health checks
- Configurable failure thresholds

## 📚 API Documentation

**Swagger UI**: http://localhost:3000/api/docs  
**OpenAPI Spec**: http://localhost:3000/api/docs.json

## 🤝 Contributing

1. Follow existing middleware patterns
2. Add comprehensive error handling
3. Include health check updates
4. Update service routing configuration
5. Add appropriate logging and monitoring

## 🔗 Related Services

- [User Management](./user-management.md) - Authentication backend
- [Business Discovery](./business-discovery.md) - Business data services
- [Video Scraping](./video-scraping.md) - Instagram scraping services

---

**Next**: [User Management Service](./user-management.md)