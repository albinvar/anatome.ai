# Anatome.ai Documentation

This documentation provides comprehensive information about the Anatome.ai microservices architecture, APIs, deployment, and development.

## 📁 Documentation Structure

### [Architecture](./architecture/)
- [System Overview](./architecture/overview.md)
- [Microservices Architecture](./architecture/microservices.md)
- [Data Flow](./architecture/data-flow.md)
- [Security Architecture](./architecture/security.md)

### [Services](./services/)
- [API Gateway](./services/api-gateway.md)
- [User Management](./services/user-management.md)
- [Business Discovery](./services/business-discovery.md)
- [Video Scraping](./services/video-scraping.md)
- [Instagram Detection](./services/instagram-detection.md)
- [Video Analysis](./services/video-analysis.md)
- [Report Generation](./services/report-generation.md)
- [Analytics](./services/analytics.md)
- [File Storage](./services/file-storage.md)
- [Job Queue](./services/job-queue.md)

### [API Reference](./api/)
- [Authentication API](./api/authentication.md)
- [Business API](./api/business.md)
- [Video Scraping API](./api/video-scraping.md)
- [Analytics API](./api/analytics.md)
- [Error Handling](./api/error-handling.md)

### [Deployment](./deployment/)
- [Development Setup](./deployment/development.md)
- [Production Deployment](./deployment/production.md)
- [Environment Configuration](./deployment/environment.md)
- [Monitoring & Logging](./deployment/monitoring.md)

## 🚀 Quick Start

1. **Development Environment**
   ```bash
   cp .env.example .env
   npm run dev
   ```

2. **API Documentation**
   - Main API: http://localhost:3000/api/docs
   - Video Scraping: http://localhost:8001/docs

3. **Health Checks**
   - System Health: http://localhost:3000/health
   - Individual Services: http://localhost:{port}/health

## 📊 Service Ports

| Service | Port | Documentation |
|---------|------|---------------|
| API Gateway | 3000 | [Link](./services/api-gateway.md) |
| User Management | 3001 | [Link](./services/user-management.md) |
| Business Discovery | 3002 | [Link](./services/business-discovery.md) |
| Instagram Detection | 3003 | [Link](./services/instagram-detection.md) |
| Video Analysis | 3004 | [Link](./services/video-analysis.md) |
| Report Generation | 3005 | [Link](./services/report-generation.md) |
| Analytics | 3006 | [Link](./services/analytics.md) |
| File Storage | 3007 | [Link](./services/file-storage.md) |
| Job Queue | 3008 | [Link](./services/job-queue.md) |
| Video Scraping | 8001 | [Link](./services/video-scraping.md) |

## 🔑 Key Features

- **Microservices Architecture**: Scalable, maintainable service design
- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Configurable rate limits per service
- **Background Jobs**: Async processing with Bull/Redis
- **File Storage**: Backblaze B2 / AWS S3 integration
- **API Documentation**: Swagger/OpenAPI specs
- **Health Monitoring**: Comprehensive health checks
- **Environment Configuration**: Flexible configuration management

## 🛠 Technology Stack

### Backend
- **Node.js** with Express.js and TypeScript
- **Python** with FastAPI for video scraping
- **MongoDB** for primary data storage
- **Redis** for caching and job queues

### External Services
- **Serper.dev** for business discovery
- **Instagram** scraping with Instaloader
- **OpenRouter** with GPT-5-nano for AI processing
- **Backblaze B2** for file storage

### Development
- **Docker** and Docker Compose
- **TypeScript** for type safety
- **ESLint** and Prettier for code quality
- **Jest** for testing

## 📝 API Standards

All APIs follow consistent patterns:

```json
{
  "success": true,
  "data": {},
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Error responses:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

## 🔐 Authentication

All protected endpoints require JWT Bearer token:

```bash
Authorization: Bearer <access_token>
```

Tokens expire in 15 minutes with refresh token rotation for security.

## 📈 Performance & Scaling

- **Database Indexing**: Optimized MongoDB indexes
- **Connection Pooling**: Efficient database connections
- **Caching Strategy**: Redis for session and API caching
- **Rate Limiting**: Per-user and per-endpoint limits
- **Background Processing**: Async job queues

## 🔍 Monitoring

- **Health Checks**: `/health` endpoint on all services
- **Structured Logging**: Winston with service correlation
- **Error Tracking**: Comprehensive error handling
- **Performance Metrics**: Response times and throughput

## 🤝 Contributing

1. Follow the established patterns in existing services
2. Add comprehensive tests for new features
3. Update documentation for API changes
4. Follow TypeScript strict mode guidelines
5. Use conventional commit messages

## 📄 License

MIT License - See [LICENSE](../LICENSE) for details

---

For specific service documentation, see the [services](./services/) directory.