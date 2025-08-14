import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Anatome.ai API',
      version: '1.0.0',
      description: 'Competitive Intelligence Platform API',
      contact: {
        name: 'API Support',
        url: 'https://anatome.ai',
      },
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://api.anatome.ai'
          : 'http://localhost:3000',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          required: ['id', 'email', 'name', 'role'],
          properties: {
            id: {
              type: 'string',
              description: 'User ID',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
            },
            name: {
              type: 'string',
              description: 'User full name',
            },
            role: {
              type: 'string',
              enum: ['admin', 'user'],
              description: 'User role',
            },
            subscription: {
              type: 'object',
              properties: {
                plan: {
                  type: 'string',
                  enum: ['free', 'pro', 'enterprise'],
                },
                expiresAt: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Business: {
          type: 'object',
          required: ['id', 'name', 'type', 'location', 'industry'],
          properties: {
            id: {
              type: 'string',
            },
            name: {
              type: 'string',
            },
            type: {
              type: 'string',
            },
            location: {
              type: 'object',
              properties: {
                address: { type: 'string' },
                city: { type: 'string' },
                state: { type: 'string' },
                country: { type: 'string' },
                coordinates: {
                  type: 'object',
                  properties: {
                    lat: { type: 'number' },
                    lng: { type: 'number' },
                  },
                },
              },
            },
            industry: {
              type: 'string',
            },
            website: {
              type: 'string',
              format: 'uri',
            },
            competitors: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            discoveryStatus: {
              type: 'string',
              enum: ['pending', 'discovering', 'completed', 'failed'],
            },
          },
        },
        Video: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            socialProfileId: { type: 'string' },
            businessId: { type: 'string' },
            videoUrl: { type: 'string' },
            thumbnailUrl: { type: 'string' },
            s3Url: { type: 'string' },
            caption: { type: 'string' },
            likes: { type: 'integer' },
            comments: { type: 'integer' },
            shares: { type: 'integer' },
            views: { type: 'integer' },
            duration: { type: 'number' },
            publishedAt: { type: 'string', format: 'date-time' },
            analysisStatus: {
              type: 'string',
              enum: ['pending', 'processing', 'completed', 'failed'],
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
            },
            data: {
              type: 'object',
            },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                },
                message: {
                  type: 'string',
                },
                details: {
                  type: 'object',
                },
              },
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization',
      },
      {
        name: 'Users',
        description: 'User management',
      },
      {
        name: 'Businesses',
        description: 'Business and competitor management',
      },
      {
        name: 'Discovery',
        description: 'Competitor discovery',
      },
      {
        name: 'Instagram',
        description: 'Instagram profile management',
      },
      {
        name: 'Videos',
        description: 'Video scraping and analysis',
      },
      {
        name: 'Analytics',
        description: 'Performance analytics',
      },
      {
        name: 'Reports',
        description: 'Report generation',
      },
      {
        name: 'Health',
        description: 'System health checks',
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/swagger/*.ts'],
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Express): void => {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Anatome.ai API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
    },
  }));
  
  // API spec endpoint
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};