import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as crypto from 'crypto';
import {
  AnalyticsEvent,
  AnalyticsRecord,
  DeviceInfo,
  Location,
} from '../declarations/analytics';

const s3Client = new S3Client({});

export default class AnalyticsService {
  private event: APIGatewayProxyEvent;

  constructor(event: APIGatewayProxyEvent) {
    this.event = event;
  }

  async handle(): Promise<APIGatewayProxyResult> {
    if (process.env.NODE_ENV !== 'cicd') {
      console.log('Analytics event received:', JSON.stringify(this.event, null, 2));
    }

    const requestOrigin = this.event.headers?.origin || this.event.headers?.Origin;
    const corsHeaders = {
      'Access-Control-Allow-Origin': this.getCorsOrigin(requestOrigin),
      'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
    };

    // Validate origin is allowed
    if (!this.isAllowedOrigin(requestOrigin)) {
      if (process.env.NODE_ENV !== 'cicd') {
        console.error(
          `Origin not allowed: ${requestOrigin}. Allowed origins: ${this.getAllowedCorsOrigins().join(', ')}`
        );
      }
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Forbidden',
          message: 'Origin not allowed',
        }),
      };
    }

    // Handle preflight requests
    if (this.event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: '',
      };
    }

    try {
      // Parse request body
      const body: AnalyticsEvent = JSON.parse(this.event.body || '{}');

      // Validate required fields
      if (!body.bucket) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'Missing required field: bucket',
            message: 'You must specify the S3 bucket name in the request body',
          }),
        };
      }

      if (!body.eventType || !body.timestamp) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'Missing required fields: eventType and timestamp',
          }),
        };
      }

      // Validate bucket is allowed
      if (!this.isAllowedBucket(body.bucket)) {
        if (process.env.NODE_ENV !== 'cicd') {
          console.error(
            `Bucket not allowed: ${body.bucket}. Allowed buckets: ${this.getAllowedBuckets().join(', ')}`
          );
        }
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'Forbidden',
            message: 'The specified bucket is not authorized for this analytics service',
          }),
        };
      }

      // Get IP address
      const ip =
        this.event.requestContext?.identity?.sourceIp ||
        this.event.headers?.['x-forwarded-for']?.split(',')[0] ||
        'unknown';

      // Extract user agent
      const userAgent =
        body.userAgent || this.event.headers?.['user-agent'] || 'Unknown';

      // Parse device and browser info
      const deviceInfo = this.parseUserAgent(userAgent);

      // Get location from CloudFront headers
      const location = this.getLocationFromHeaders(this.event.headers || {});

      // Create server timestamp
      const serverTimestamp = new Date().toISOString();
      const clientTimestamp = body.timestamp;

      // Generate unique event ID
      const eventId = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

      // Build analytics record
      const { userid = null, ...remainingMetadata } = body.metadata || {};
      const record: AnalyticsRecord = {
        eventId,
        eventType: body.eventType,
        timestamp: clientTimestamp,
        serverTimestamp,
        page: body.page || 'unknown',
        sessionId: body.sessionId || 'unknown',
        ip,
        location,
        device: deviceInfo,
        viewport: body.viewport || { width: 0, height: 0 },
        referrer: body.referrer || this.event.headers?.referer || 'direct',
        userAgent,
        userid,
        // Include any additional metadata
        ...remainingMetadata,
      };

      // Parse timestamp for S3 partitioning
      const partitionDate = new Date();
      const { year, month, day } = this.getYmdInTimeZone(partitionDate, 'America/New_York');

      // Create S3 key with date partitioning
      const key = `analytics/year=${year}/month=${month}/day=${day}/${eventId}.json`;

      // Write to S3
      await s3Client.send(
        new PutObjectCommand({
          Bucket: body.bucket,
          Key: key,
          Body: JSON.stringify(record),
          ContentType: 'application/json',
        })
      );

      console.log(`Analytics event written to S3: s3://${body.bucket}/${key}`);

      // Return success response
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          status: 'ok',
          eventId,
          bucket: body.bucket,
          key,
        }),
      };
    } catch (error) {
      if (process.env.NODE_ENV !== 'cicd') {
        console.error('Error processing analytics event:', error);
      }

      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      };
    }
  }

  /**
   * Get allowed buckets from environment variable
   * Parses on each request to support testing
   */
  private getAllowedBuckets(): string[] {
    return (process.env.ALLOWED_BUCKETS || '')
      .split(',')
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
  }

  /**
   * Get allowed CORS origins from environment variable
   */
  private getAllowedCorsOrigins(): string[] {
    return (process.env.CORS_ORIGINS || '*')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
  }

  /**
   * Check if origin is allowed
   */
  private isAllowedOrigin(requestOrigin: string | undefined): boolean {
    const allowedOrigins = this.getAllowedCorsOrigins();

    // If wildcard, allow all
    if (allowedOrigins.length === 1 && allowedOrigins[0] === '*') {
      return true;
    }

    // Check if request origin is in allowed list
    return requestOrigin !== undefined && allowedOrigins.includes(requestOrigin);
  }

  /**
   * Get CORS origin for response based on request origin
   */
  private getCorsOrigin(requestOrigin: string | undefined): string {
    const allowedOrigins = this.getAllowedCorsOrigins();

    // If wildcard, allow all
    if (allowedOrigins.length === 1 && allowedOrigins[0] === '*') {
      return '*';
    }

    // Check if request origin is in allowed list
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }

    // Return first allowed origin as fallback
    return allowedOrigins[0] || '*';
  }

  /**
   * Parse user agent to extract device and browser information
   */
  private parseUserAgent(ua: string): DeviceInfo {
    const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
    const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua);

    let browser = 'Unknown';
    if (ua.includes('Chrome') && !ua.includes('Edg')) {
      browser = 'Chrome';
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      browser = 'Safari';
    } else if (ua.includes('Firefox')) {
      browser = 'Firefox';
    } else if (ua.includes('Edg')) {
      browser = 'Edge';
    } else if (ua.includes('MSIE') || ua.includes('Trident/')) {
      browser = 'Internet Explorer';
    }

    return {
      device_type: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
      browser: browser,
    };
  }

/**
   * Get location from CloudFront headers (if available)
   */
  private getLocationFromHeaders(headers: Record<string, string | undefined>): Location {
    return {
      country: headers['cloudfront-viewer-country'] || 'Unknown',
      city: headers['cloudfront-viewer-city'] || 'Unknown',
      region: headers['cloudfront-viewer-country-region'] || 'Unknown',
    };
  }

  /**
   * Validate bucket is in allowed list
   */
  private isAllowedBucket(bucket: string): boolean {
    const allowedBuckets = this.getAllowedBuckets();

    // If ALLOWED_BUCKETS is empty, allow all buckets (permissive mode)
    if (allowedBuckets.length === 0) {
      console.warn('ALLOWED_BUCKETS not configured - allowing all buckets (not recommended for production)');
      return true;
    }

    // Check if bucket matches any allowed pattern (supports wildcards)
    return allowedBuckets.some((allowed: string) => {
      if (allowed.includes('*')) {
        const regex = new RegExp('^' + allowed.replace(/\*/g, '.*') + '$');
        return regex.test(bucket);
      }
      return bucket === allowed;
    });
  }

  private getYmdInTimeZone(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const year = get('year');
    const month = get('month');
    const day = get('day');

    if (!year || !month || !day) throw new Error('Failed to compute date parts');
    return { year, month, day };
  }
}
