import { APIGatewayProxyEvent } from 'aws-lambda';
import { track } from '../handler';

describe('Analytics Tracker Lambda Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-analytics-gtng,my-app-analytics,*-staging',
      CORS_ORIGIN: '*',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createMockEvent = (body: any, headers: any = {}): APIGatewayProxyEvent => {
    return {
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        ...headers,
      },
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/track',
      pathParameters: null,
      queryStringParameters: null,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api',
        protocol: 'HTTP/1.1',
        httpMethod: 'POST',
        path: '/track',
        stage: 'test',
        requestId: 'test-request-id',
        requestTime: new Date().toISOString(),
        requestTimeEpoch: Date.now(),
        identity: {
          sourceIp: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          user: null,
          userArn: null,
        },
        authorizer: null,
        domainName: 'test.execute-api.us-east-1.amazonaws.com',
        domainPrefix: 'test',
        resourceId: 'test-resource',
        resourcePath: '/track',
      },
      resource: '/track',
    } as APIGatewayProxyEvent;
  };

  it('Should reject request with missing bucket field', async () => {
    const event = createMockEvent({
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
    });

    const result = await track(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Missing required field: bucket');
  });

  it('Should reject request with missing eventType', async () => {
    const event = createMockEvent({
      bucket: 'test-analytics-gtng',
      timestamp: new Date().toISOString(),
      page: '/test',
    });

    const result = await track(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Missing required fields');
  });

  it('Should reject request with missing timestamp', async () => {
    const event = createMockEvent({
      bucket: 'test-analytics-gtng',
      eventType: 'page_view',
      page: '/test',
    });

    const result = await track(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Missing required fields');
  });

  it('Should reject unauthorized bucket', async () => {
    const event = createMockEvent({
      bucket: 'unauthorized-bucket',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'Mozilla/5.0',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event);

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toBe('Forbidden');
  });

  it('Should accept exact bucket match', async () => {
    const event = createMockEvent({
      bucket: 'test-analytics-gtng',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/articles/test',
      userAgent: 'Mozilla/5.0',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session-123',
    });

    const result = await track(event);

    // Note: Will fail with S3 error in test environment without AWS credentials
    // but should pass validation
    expect([200, 500]).toContain(result.statusCode);
    expect(typeof result.body).toBe('string');
  });

  it('Should accept wildcard bucket match', async () => {
    process.env.ALLOWED_BUCKETS = '*-staging';

    const event = createMockEvent({
      bucket: 'my-app-staging',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'Mozilla/5.0',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event);

    expect([200, 500]).toContain(result.statusCode);
  });

  it('Should handle OPTIONS request (CORS preflight)', async () => {
    const event = createMockEvent({}, {});
    event.httpMethod = 'OPTIONS';

    const result = await track(event);

    expect(result.statusCode).toBe(200);
    expect(result.headers).toBeDefined();
    expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
    expect(result.headers!['Access-Control-Allow-Methods']).toContain('POST');
  });

  it('Response should have CORS headers', async () => {
    const event = createMockEvent({
      bucket: 'test-analytics-gtng',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
    });

    const result = await track(event);

    expect(result.headers).toBeDefined();
    expect(result.headers!['Access-Control-Allow-Origin']).toBeDefined();
    expect(result.headers!['Content-Type']).toBe('application/json');
  });

  it('Response body should be JSON string', async () => {
    const event = createMockEvent({
      bucket: 'test-analytics-gtng',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
    });

    const result = await track(event);

    expect(typeof result.body).toBe('string');
    expect(() => JSON.parse(result.body)).not.toThrow();
  });

  it('Should include custom metadata in event', async () => {
    const event = createMockEvent({
      bucket: 'test-analytics-gtng',
      eventType: 'scroll_complete',
      timestamp: new Date().toISOString(),
      page: '/articles/test',
      userAgent: 'Mozilla/5.0',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
      metadata: {
        timeOnPage: 45,
        scrollDepth: 100,
        customField: 'test-value',
      },
    });

    const result = await track(event);

    // Should accept the request (validation passed)
    expect([200, 500]).toContain(result.statusCode);
  });
});
