import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env.js';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Mediasoup WebRTC & Auth API',
            version: '1.0.0',
            description: 'Professional WebRTC API with Mediasoup, PostgreSQL, and OAuth',
            license: {
                name: 'MIT',
                url: 'https://spdx.org/licenses/MIT.html',
            },
            contact: {
                name: 'API Support',
                url: 'https://github.com/talha',
            },
        },
        servers: [
            {
                url: '/api',
                description: 'Current environment server',
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
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        username: { type: 'string' },
                        role: { type: 'string', enum: ['USER', 'ADMIN', 'MODERATOR'] },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        avatar: { type: 'string' },
                        isActive: { type: 'boolean' },
                    },
                },
                UpdateUser: {
                    type: 'object',
                    properties: {
                        username: { type: 'string' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        avatar: { type: 'string' },
                    },
                },
            },
        },
    },
    apis: ['./src/api/routes/**/*.js', './src/api/controllers/*.js'], // Recursive path to include v1, v2...
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
