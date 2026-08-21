// config/prisma.js
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env.js';
import logger from '../api/utils/logger.js';
import { PasswordService } from '../services/password.service.js';

class PrismaManager {
  constructor() {
    this.prisma = null;
    this.pool = null; // Store pool to close it later
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 1000;
  }

  async getClient() {
    if (this.prisma) return this.prisma;

    try {
      if (!env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not defined in environment variables');
      }

      // Log connection attempt (without sensitive data)
      const sanitizedUrl = env.DATABASE_URL.replace(/:[^:@]*@/, ':***@');
      logger.info('🔌 Connecting to PostgreSQL via Driver Adapter', {
        url: sanitizedUrl,
        environment: env.NODE_ENV,
      });

      // Prisma 7 requires a driver adapter for standard PostgreSQL connections
      this.pool = new pg.Pool({
        connectionString: env.DATABASE_URL,
        max: env.DATABASE_POOL_MAX || 20,
        idleTimeoutMillis: (env.DATABASE_POOL_TIMEOUT || 10) * 1000,
      });

      const adapter = new PrismaPg(this.pool);

      let client = new PrismaClient({
        adapter,
        log: env.NODE_ENV === 'development'
          ? ['info', 'warn', 'error']
          : ['error'],
        errorFormat: 'pretty',
      });

      // Add extensions for logging
      client = client.$extends({
        query: {
          async $allOperations({ model, operation, args, query }) {
            const start = Date.now();
            try {
              const result = await query(args);
              const duration = Date.now() - start;

              if (duration > 1000) {
                logger.warn('🐢 Slow database query', { model, operation, duration: `${duration}ms` });
              } else if (env.NODE_ENV === 'development') {
                logger.debug('📊 Database query', { model, operation, duration: `${duration}ms` });
              }

              return result;
            } catch (error) {
              const duration = Date.now() - start;
              logger.error('❌ Database query error', {
                model,
                operation,
                error: error.message,
                duration: `${duration}ms`,
              });
              throw error;
            }
          },
        },
      });

      // Test connection
      await client.$connect();
      logger.info('✅ PostgreSQL connected successfully');

      this.prisma = client;
      this.connectionAttempts = 0;

      return this.prisma;
    } catch (error) {
      this.connectionAttempts++;

      logger.error('❌ PostgreSQL connection failed', {
        attempt: this.connectionAttempts,
        maxRetries: this.maxRetries,
        error: error.message,
      });

      if (this.connectionAttempts < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, this.connectionAttempts - 1);
        logger.info(`⏳ Retrying connection in ${delay}ms...`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.getClient();
      }

      logger.error('💥 Failed to connect to PostgreSQL after max retries');
      throw new Error(`Failed to connect to database after ${this.maxRetries} attempts`);
    }
  }

  async disconnect() {
    if (this.prisma) {
      await this.prisma.$disconnect();
      if (this.pool) {
        await this.pool.end();
      }
      logger.info('📤 PostgreSQL disconnected gracefully');
      this.prisma = null;
      this.pool = null;
    }
  }

  async healthCheck() {
    try {
      if (!this.prisma) {
        await this.getClient();
      }

      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1 as health_check`;
      const latency = Date.now() - start;

      return {
        status: 'healthy',
        latency: `${latency}ms`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

const prismaManager = new PrismaManager();

let prisma;
try {
  prisma = await prismaManager.getClient();
} catch (error) {
  logger.error('❌ Failed to initialize Prisma client:', { error: error.message });
  if (env.NODE_ENV === 'production') process.exit(1);
}

const createDefaultAdmin = async () => {
  try {
    const adminExists = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (!adminExists) {
      const hashedPassword = await PasswordService.hash(env.ADMIN_PASSWORD);
      await prisma.user.create({
        data: {
          username: env.ADMIN_USERNAME,
          email: env.ADMIN_EMAIL,
          password: hashedPassword,
          role: 'ADMIN',
          isActive: true,
          provider: 'local',
        },
      });
      logger.info(`👑 Default admin created successfully: ${env.ADMIN_USERNAME}`);
    }
  } catch (error) {
    logger.error('❌ Failed to create default admin:', error.message);
  }
};

if (prisma) {
  await createDefaultAdmin();
}

process.on('SIGTERM', async () => {
  await prismaManager.disconnect();
  process.on('exit', () => process.exit(0));
});

process.on('SIGINT', async () => {
  await prismaManager.disconnect();
  process.on('exit', () => process.exit(0));
});

export { prisma, prismaManager };
export default prisma;