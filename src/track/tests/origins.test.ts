import { track } from '../handler';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Mock the S3 client
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: jest.fn(),
}));

const ALLOWED_ORIGINS = [
  'https://staging.naeemgitonga.com',
  'https://naeemgitonga.com',
];

const DISALLOWED_ORIGINS = [
  'https://malicious-site.com',
  'https://attacker.com',
  'http://localhost:3000',
  'https://example.com',
  'https://naeemgitonga.com.evil.com',
  'https://fakenaeemgitonga.com',
];

function createMockEvent(
  origin: string | undefined,
  method: string = 'POST',
  body?: object
): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    headers: {
      origin,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : null,
    requestContext: {
      identity: {
        sourceIp: '127.0.0.1',
      },
    },
    pathParameters: null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    path: '',
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEvent;
}

describe('Lambda CORS Origin Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      CORS_ORIGINS: ALLOWED_ORIGINS.join(','),
      ALLOWED_BUCKETS: 'test-bucket',
      NODE_ENV: 'cicd',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Allowed origins', () => {
    test.each(ALLOWED_ORIGINS)(
      'should return 200 OK for allowed origin: %s',
      async (origin) => {
        const event = createMockEvent(origin, 'POST', {
          bucket: 'test-bucket',
          eventType: 'page_view',
          timestamp: new Date().toISOString(),
          page: '/test',
          userAgent: 'test-agent',
          viewport: { width: 1920, height: 1080 },
          sessionId: 'test-session',
        });

        const result = await track(event, {} as any as Context, ()=>{});

        expect(result.statusCode).toBe(200);
        expect(result.headers?.['Access-Control-Allow-Origin']).toBe(origin);
        const body = JSON.parse(result.body);
        expect(body.status).toBe('ok');
      }
    );

    test.each(ALLOWED_ORIGINS)(
      'should return 200 OK for OPTIONS preflight from allowed origin: %s',
      async (origin) => {
        const event = createMockEvent(origin, 'OPTIONS');

        const result = await track(event, {} as any as Context, ()=>{});

        expect(result.statusCode).toBe(200);
        expect(result.headers?.['Access-Control-Allow-Origin']).toBe(origin);
      }
    );
  });

  describe('Disallowed origins', () => {
    test.each(DISALLOWED_ORIGINS)(
      'should return 403 Forbidden for disallowed origin: %s',
      async (origin) => {
        const event = createMockEvent(origin, 'POST', {
          bucket: 'test-bucket',
          eventType: 'page_view',
          timestamp: new Date().toISOString(),
          page: '/test',
          userAgent: 'test-agent',
          viewport: { width: 1920, height: 1080 },
          sessionId: 'test-session',
        });

        const result = await track(event, {} as any as Context, ()=>{});

        // Should reject with 403 Forbidden
        expect(result.statusCode).toBe(403);
        const body = JSON.parse(result.body);
        expect(body.error).toBe('Forbidden');
        expect(body.message).toBe('Origin not allowed');
      }
    );

    test.each(DISALLOWED_ORIGINS)(
      'should return 403 Forbidden for OPTIONS preflight from disallowed origin: %s',
      async (origin) => {
        const event = createMockEvent(origin, 'OPTIONS');

        const result = await track(event);

        // Even preflight requests should be rejected with 403
        expect(result.statusCode).toBe(403);
        const body = JSON.parse(result.body);
        expect(body.error).toBe('Forbidden');
        expect(body.message).toBe('Origin not allowed');
      }
    );
  });

  describe('Edge cases', () => {
    test('should return 403 for requests with no origin header', async () => {
      const event = createMockEvent(undefined, 'POST', {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      });

      const result = await track(event, {} as any as Context, ()=>{});

      // Without an origin, request should be rejected
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toBe('Origin not allowed');
    });

    test('should return 403 for origin that is a substring match but not exact', async () => {
      const event = createMockEvent(
        'https://staging.naeemgitonga.com.attacker.com',
        'POST',
        {
          bucket: 'test-bucket',
          eventType: 'page_view',
          timestamp: new Date().toISOString(),
          page: '/test',
          userAgent: 'test-agent',
          viewport: { width: 1920, height: 1080 },
          sessionId: 'test-session',
        }
      );

      const result = await track(event, {} as any as Context, ()=>{});

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toBe('Origin not allowed');
    });

    test('should return 403 for origin with different protocol (http vs https)', async () => {
      const event = createMockEvent(
        'http://naeemgitonga.com', // http instead of https
        'POST',
        {
          bucket: 'test-bucket',
          eventType: 'page_view',
          timestamp: new Date().toISOString(),
          page: '/test',
          userAgent: 'test-agent',
          viewport: { width: 1920, height: 1080 },
          sessionId: 'test-session',
        }
      );

      const result = await track(event, {} as any as Context, ()=>{});

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toBe('Origin not allowed');
    });

    test('should return 403 for origin with port number when not allowed', async () => {
      const event = createMockEvent(
        'https://naeemgitonga.com:8080',
        'POST',
        {
          bucket: 'test-bucket',
          eventType: 'page_view',
          timestamp: new Date().toISOString(),
          page: '/test',
          userAgent: 'test-agent',
          viewport: { width: 1920, height: 1080 },
          sessionId: 'test-session',
        }
      );

      const result = await track(event, {} as any as Context, ()=>{});

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toBe('Origin not allowed');
    });
  });
});
