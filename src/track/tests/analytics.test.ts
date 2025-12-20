import { track } from '../handler';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Mock the S3 client
jest.mock('@aws-sdk/client-s3', () => {
  const mockSendFn = jest.fn().mockResolvedValue({});
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSendFn,
    })),
    PutObjectCommand: jest.fn(),
    __mockSend: mockSendFn, // Export for test access
  };
});

// Get access to the mock send function
const { __mockSend: mockSend } = jest.requireMock('@aws-sdk/client-s3');

function createMockEvent(
  body: object,
  headers: object = {},
  sourceIp: string = '192.168.1.1'
): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'https://naeemgitonga.com',
      ...headers,
    },
    body: JSON.stringify(body),
    requestContext: {
      identity: {
        sourceIp,
      },
    } as any,
    pathParameters: null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    path: '/track',
    isBase64Encoded: false,
  } as APIGatewayProxyEvent;
}

describe('AnalyticsService - User Agent Parsing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CORS_ORIGINS: 'https://naeemgitonga.com',
      ALLOWED_BUCKETS: 'test-bucket',
      NODE_ENV: 'cicd',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should detect Firefox browser', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should detect Edge browser', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.1901.188',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should detect Internet Explorer browser (MSIE)', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) like Gecko',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should detect Safari browser', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should detect mobile device (iPhone)', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
        viewport: { width: 390, height: 844 },
        sessionId: 'test-session',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should detect tablet device (iPad)', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
        viewport: { width: 1024, height: 768 },
        sessionId: 'test-session',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should detect Android tablet', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        viewport: { width: 1024, height: 768 },
        sessionId: 'test-session',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });
});

describe('AnalyticsService - Bucket Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should allow all buckets when ALLOWED_BUCKETS is empty', async () => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: '',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd',
    };

    const event = createMockEvent({
      bucket: 'any-random-bucket',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should handle wildcard bucket patterns', async () => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'analytics-*,*-staging',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd',
    };

    const event = createMockEvent({
      bucket: 'analytics-production',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });
});

describe('AnalyticsService - CloudFront Headers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should extract location from CloudFront headers', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      },
      {
        'cloudfront-viewer-country': 'US',
        'cloudfront-viewer-city': 'Seattle',
        'cloudfront-viewer-country-region': 'WA',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should handle missing CloudFront headers', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      },
      {}
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });
});

describe('AnalyticsService - IP Handling', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should hash IP address from sourceIp', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      },
      {},
      '203.0.113.42'
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should handle x-forwarded-for header', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      },
      {
        'x-forwarded-for': '203.0.113.1, 198.51.100.1',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });
});

describe('AnalyticsService - CORS Wildcard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: '*',
      NODE_ENV: 'cicd',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should allow any origin with wildcard CORS', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      },
      {
        origin: 'https://any-random-site.com',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });
});

describe('AnalyticsService - Optional Fields', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should use defaults when optional fields are missing', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        // Missing: page, userAgent, viewport, sessionId, referrer
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should handle missing userAgent in body and headers', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
        // No userAgent in body
      },
      {
        // No user-agent header
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should handle missing referrer in body and headers', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
        // No referrer
      },
      {
        // No referer header
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should use referer header when body.referrer is missing', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
        // No referrer in body
      },
      {
        referer: 'https://google.com',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should handle missing viewport', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        sessionId: 'test-session',
        // No viewport
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should handle missing metadata', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
        // No metadata
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });
});

describe('AnalyticsService - Error Handling', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'development', // Not 'cicd' to test error logging
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should log origin rejection in development mode', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      },
      {
        origin: 'https://evil.com',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(403);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  test('should log bucket rejection in development mode', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const event = createMockEvent(
      {
        bucket: 'unauthorized-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(403);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe('AnalyticsService - User Agent Edge Cases', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should detect Chrome browser', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should handle Unknown browser', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'SomeUnknownBrowser/1.0',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should detect Android mobile device', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
        viewport: { width: 412, height: 915 },
        sessionId: 'test-session',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should detect iPod as mobile', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 12_0 like Mac OS X) AppleWebKit/605.1.15',
        viewport: { width: 320, height: 568 },
        sessionId: 'test-session',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });
});

describe('AnalyticsService - IP Address Branches', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should use unknown when no IP is available', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://naeemgitonga.com',
      },
      body: JSON.stringify({
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      }),
      requestContext: {
        identity: {},
      } as any,
      pathParameters: null,
      queryStringParameters: null,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '',
      path: '/track',
      isBase64Encoded: false,
    } as APIGatewayProxyEvent;

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should handle missing headers object', async () => {
    const event = {
      httpMethod: 'POST',
      headers: undefined, // No headers object
      body: JSON.stringify({
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      }),
      requestContext: {
        identity: {
          sourceIp: '192.168.1.1',
        },
      } as any,
      pathParameters: null,
      queryStringParameters: null,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '',
      path: '/track',
      isBase64Encoded: false,
    } as any as APIGatewayProxyEvent;

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(403); // Will be rejected because no origin header
  });

  test('should get userAgent from header when not in body', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
        // No userAgent
      },
      {
        'user-agent': 'Mozilla/5.0 (Test Browser)',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should handle case with uppercase Origin header', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://naeemgitonga.com', // Uppercase
      },
      body: JSON.stringify({
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      }),
      requestContext: {
        identity: {
          sourceIp: '192.168.1.1',
        },
      } as any,
      pathParameters: null,
      queryStringParameters: null,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '',
      path: '/track',
      isBase64Encoded: false,
    } as APIGatewayProxyEvent;

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });
});

describe('AnalyticsService - CORS Fallback Logic', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://site1.com,https://site2.com',
      NODE_ENV: 'cicd',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should return first allowed origin as fallback when origin not in list', async () => {
    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      },
      {
        origin: 'https://evil.com',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(403);
    // Even though rejected, should return first origin as fallback in CORS header
    expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined();
  });

  test('should return * as fallback when CORS_ORIGINS is not set', async () => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      // CORS_ORIGINS not set, defaults to '*'
      NODE_ENV: 'cicd',
    };
    delete process.env.CORS_ORIGINS;

    const event = createMockEvent(
      {
        bucket: 'test-bucket',
        eventType: 'page_view',
        timestamp: new Date().toISOString(),
        page: '/test',
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
        sessionId: 'test-session',
      },
      {
        origin: 'https://naeemgitonga.com',
      }
    );

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200); // Allowed because defaults to '*'
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });
});

describe('AnalyticsService - Empty Body Handling', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should handle null body by using empty object', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://naeemgitonga.com',
      },
      body: null, // Null body
      requestContext: {
        identity: {
          sourceIp: '192.168.1.1',
        },
      } as any,
      pathParameters: null,
      queryStringParameters: null,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '',
      path: '/track',
      isBase64Encoded: false,
    } as any as APIGatewayProxyEvent;

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Missing required field: bucket');
  });

  test('should handle undefined body by using empty object', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://naeemgitonga.com',
      },
      // body is undefined
      requestContext: {
        identity: {
          sourceIp: '192.168.1.1',
        },
      } as any,
      pathParameters: null,
      queryStringParameters: null,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '',
      path: '/track',
      isBase64Encoded: false,
    } as any as APIGatewayProxyEvent;

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Missing required field: bucket');
  });
});

describe('AnalyticsService - Wildcard Bucket Matching', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'exact-bucket,prefix-*,*-suffix,*-middle-*',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should match exact bucket name', async () => {
    const event = createMockEvent({
      bucket: 'exact-bucket',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should match prefix wildcard', async () => {
    const event = createMockEvent({
      bucket: 'prefix-something',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should match suffix wildcard', async () => {
    const event = createMockEvent({
      bucket: 'something-suffix',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should match middle wildcard', async () => {
    const event = createMockEvent({
      bucket: 'start-middle-end',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(200);
  });

  test('should reject bucket that does not match any pattern', async () => {
    const event = createMockEvent({
      bucket: 'no-match-bucket',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event, {} as Context, () => {});
    expect(result.statusCode).toBe(403);
  });
});

describe('AnalyticsService - Exception Handling', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    mockSend.mockClear();
    mockSend.mockResolvedValue({}); // Reset to default success
    jest.restoreAllMocks();
  });

  test('should log error in non-cicd environment when exception occurs', async () => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'development', // Not 'cicd' to trigger error logging
    };

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock S3 to throw an Error
    mockSend.mockRejectedValueOnce(new Error('S3 upload failed'));

    const event = createMockEvent({
      bucket: 'test-bucket',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event, {} as Context, () => {});

    expect(result.statusCode).toBe(500);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error processing analytics event:',
      expect.any(Error)
    );
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Internal server error');
    expect(body.message).toBe('S3 upload failed');

    consoleSpy.mockRestore();
  });

  test('should not log error in cicd environment when exception occurs', async () => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd', // In cicd mode - should NOT log
    };

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock S3 to throw an Error
    mockSend.mockRejectedValueOnce(new Error('S3 upload failed'));

    const event = createMockEvent({
      bucket: 'test-bucket',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event, {} as Context, () => {});

    expect(result.statusCode).toBe(500);
    // Should NOT have called console.error in cicd mode
    expect(consoleSpy).not.toHaveBeenCalled();
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Internal server error');
    expect(body.message).toBe('S3 upload failed');

    consoleSpy.mockRestore();
  });

  test('should handle Error instance and use error.message', async () => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd',
    };

    // Mock S3 to throw an Error instance
    mockSend.mockRejectedValueOnce(new Error('Specific S3 error'));

    const event = createMockEvent({
      bucket: 'test-bucket',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event, {} as Context, () => {});

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Internal server error');
    expect(body.message).toBe('Specific S3 error'); // From error.message
  });

  test('should handle non-Error exception and use "Unknown error"', async () => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd',
    };

    // Mock S3 to throw a non-Error value (string)
    mockSend.mockRejectedValueOnce('Something went wrong');

    const event = createMockEvent({
      bucket: 'test-bucket',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event, {} as Context, () => {});

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Internal server error');
    expect(body.message).toBe('Unknown error'); // From ternary fallback
  });

  test('should handle date parts computation failure', async () => {
    process.env = {
      ...originalEnv,
      ALLOWED_BUCKETS: 'test-bucket',
      CORS_ORIGINS: 'https://naeemgitonga.com',
      NODE_ENV: 'cicd',
    };

    // Mock Intl.DateTimeFormat to return parts without year/month/day
    const originalDateTimeFormat = Intl.DateTimeFormat;
    Intl.DateTimeFormat = jest.fn().mockImplementation(() => ({
      formatToParts: jest.fn().mockReturnValue([
        { type: 'literal', value: '/' },
      ]),
    })) as any;

    const event = createMockEvent({
      bucket: 'test-bucket',
      eventType: 'page_view',
      timestamp: new Date().toISOString(),
      page: '/test',
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      sessionId: 'test-session',
    });

    const result = await track(event, {} as Context, () => {});

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Internal server error');
    expect(body.message).toBe('Failed to compute date parts');

    // Restore original
    Intl.DateTimeFormat = originalDateTimeFormat;
  });
});
