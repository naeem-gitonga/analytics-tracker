# Multi-Tenant Analytics Tracker

A standalone, serverless analytics tracking system for AWS that supports multiple applications and fine-grained IAM controls.

## Architecture

```
Client/App → API Gateway → Lambda → S3 (bucket per app) → Athena → Visualization
```

**Key Features:**
- ✅ Multi-tenant support (one tracker, multiple apps/buckets)
- ✅ Fine-grained IAM controls
- ✅ Bucket name passed via request (no hard-coding)
- ✅ Privacy-focused (hashed IPs, no PII)
- ✅ Serverless and scalable
- ✅ SQL-queryable via Athena

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Usage](#usage)
- [IAM Permissions](#iam-permissions)
- [Querying Data](#querying-data)
- [Multi-Tenant Setup](#multi-tenant-setup)
- [Security](#security)
- [Cost Estimation](#cost-estimation)

## Installation

### Option 1: Copy to Your Project

```bash
# Copy the entire analytics-tracker folder to your project
cp -r analytics-tracker /path/to/your/project/
cd /path/to/your/project/analytics-tracker
npm install
```

### Option 2: Clone as Separate Repository

```bash
# Create a new repo and copy contents
git init analytics-tracker
cp -r analytics-tracker/* analytics-tracker/
cd analytics-tracker
npm install
git add .
git commit -m "Initial commit: Analytics tracker"
```

## Configuration

### 1. Edit `cdk/bin/app.ts`

Configure the tracker for your use case:

```typescript
import * as cdk from 'aws-cdk-lib';
import { AnalyticsTrackerStack } from '../lib/analytics-stack';

const app = new cdk.App();

new AnalyticsTrackerStack(
  app,
  'MyAnalyticsTracker',
  {
    // List of allowed S3 buckets (supports wildcards)
    allowedBuckets: [
      'app1-analytics-prod',
      'app2-analytics-staging',
      '*-analytics',  // All buckets ending with -analytics
    ],

    // CORS origin (use '*' for all, or specify domains)
    corsOrigin: '*',

    // Function and API naming
    functionPrefix: 'mycompany',
    apiName: 'mycompany-analytics-api',

    // Optional: Additional configuration
    enableMetrics: true,
    lambdaTimeout: 10,
  },
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  }
);
```

### 2. Create S3 Buckets

Create separate buckets for each app/tenant:

```bash
aws s3 mb s3://app1-analytics-prod
aws s3 mb s3://app2-analytics-prod
```

Or use CDK/CloudFormation in your app's infrastructure.

## Deployment

```bash
# Build TypeScript
npm run build

# Preview changes
npm run synth

# Deploy to AWS
npm run deploy
```

After deployment, note the API endpoint URL:
```
Outputs:
MyAnalyticsTracker.ApiEndpoint = https://abc123.execute-api.us-east-1.amazonaws.com/prod
```

## Usage

### HTTP API Request

Send analytics events via POST request:

```bash
curl -X POST https://your-api-url.execute-api.us-east-1.amazonaws.com/prod/track \
  -H "Content-Type: application/json" \
  -d '{
    "bucket": "app1-analytics-prod",
    "eventType": "page_view",
    "timestamp": "2025-12-17T12:00:00.000Z",
    "page": "/articles/my-post",
    "userAgent": "Mozilla/5.0...",
    "viewport": { "width": 1920, "height": 1080 },
    "sessionId": "abc123",
    "referrer": "https://google.com"
  }'
```

### Request Schema

**Required Fields:**
- `bucket` (string): S3 bucket name to write to (must be in allowedBuckets)
- `eventType` (string): Type of event (e.g., "page_view", "scroll_complete")
- `timestamp` (string): ISO 8601 timestamp

**Optional Fields:**
- `page` (string): Page path
- `userAgent` (string): Browser user agent
- `viewport` (object): `{ width: number, height: number }`
- `sessionId` (string): Session identifier
- `referrer` (string): Referrer URL
- `metadata` (object): Any additional custom data

### Response

**Success (200):**
```json
{
  "status": "ok",
  "eventId": "1702742400-a1b2c3d4",
  "bucket": "app1-analytics-prod",
  "key": "analytics/year=2025/month=12/day=17/1702742400-a1b2c3d4.json"
}
```

**Error (400):**
```json
{
  "error": "Missing required field: bucket",
  "message": "You must specify the S3 bucket name in the request body"
}
```

**Forbidden (403):**
```json
{
  "error": "Forbidden",
  "message": "The specified bucket is not authorized for this analytics service"
}
```

## IAM Permissions

### Lambda Function Permissions

The Lambda function is granted fine-grained S3 write permissions:

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:PutObject",
    "s3:PutObjectAcl"
  ],
  "Resource": [
    "arn:aws:s3:::app1-analytics-prod/analytics/*",
    "arn:aws:s3:::app2-analytics-prod/analytics/*"
  ]
}
```

### Bucket Validation

The Lambda validates incoming bucket names against the `ALLOWED_BUCKETS` environment variable:

```typescript
// Exact match
allowedBuckets: ['app1-analytics', 'app2-analytics']

// Wildcard patterns
allowedBuckets: ['*-analytics']  // Matches: my-app-analytics, other-app-analytics
allowedBuckets: ['analytics-*']  // Matches: analytics-prod, analytics-staging
```

### Multiple API Gateways

If you have multiple API Gateways calling this tracker:

```typescript
const tracker = new AnalyticsTrackerStack(/*...*/);

// Grant permission to another API Gateway
tracker.grantInvokeToApiGateway('arn:aws:execute-api:us-east-1:123456789012:api-id/*');
```

### Additional Permissions

For encrypted buckets or other AWS services:

```typescript
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

new AnalyticsTrackerStack(app, 'Tracker', {
  allowedBuckets: ['my-encrypted-bucket'],
  additionalPolicies: [
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
      resources: ['arn:aws:kms:us-east-1:123456789012:key/your-key-id'],
    }),
  ],
});
```

## Querying Data

### 1. Set Up Athena Table

1. Open `sql/athena-setup.sql`
2. Replace `YOUR-BUCKET-NAME` with your bucket name
3. Replace `TABLE_NAME` with a unique name (e.g., `app1_events`)
4. Run in AWS Athena console

```sql
CREATE EXTERNAL TABLE analytics_db.app1_events (
  -- schema...
)
PARTITIONED BY (year STRING, month STRING, day STRING)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://app1-analytics-prod/analytics/';

-- Load partitions
MSCK REPAIR TABLE analytics_db.app1_events;
```

### 2. Run Queries

See `sql/example-queries.sql` for common queries:

```sql
-- Daily page views
SELECT year, month, day, COUNT(*) as views
FROM analytics_db.app1_events
WHERE eventType = 'page_view'
GROUP BY year, month, day
ORDER BY year DESC, month DESC, day DESC;

-- Device breakdown
SELECT device.device_type, device.browser, COUNT(*) as count
FROM analytics_db.app1_events
WHERE eventType = 'page_view'
GROUP BY device.device_type, device.browser;
```

### 3. Visualization

**Option A: AWS QuickSight**
- Connect to Athena
- Create dashboards
- ~$9/month per author

**Option B: Export to CSV**
- Run queries in Athena
- Download results
- Import to Excel/Sheets/Tableau

**Option C: Programmatic Access**
```typescript
import { AthenaClient, StartQueryExecutionCommand } from '@aws-sdk/client-athena';

const athena = new AthenaClient({ region: 'us-east-1' });
const result = await athena.send(new StartQueryExecutionCommand({
  QueryString: 'SELECT * FROM analytics_db.app1_events LIMIT 100',
  ResultConfiguration: { OutputLocation: 's3://query-results-bucket/' }
}));
```

## Multi-Tenant Setup

### Scenario: Multiple Apps, One Tracker

**Setup:**
```typescript
// Deploy ONE tracker
new AnalyticsTrackerStack(app, 'SharedTracker', {
  allowedBuckets: [
    'website-analytics',
    'mobile-app-analytics',
    'api-analytics',
  ],
});
```

**Usage:**
```bash
# Website sends to website-analytics bucket
curl -X POST https://tracker.../track -d '{"bucket": "website-analytics", ...}'

# Mobile app sends to mobile-app-analytics bucket
curl -X POST https://tracker.../track -d '{"bucket": "mobile-app-analytics", ...}'
```

**Athena Tables:**
```sql
-- One table per app
CREATE EXTERNAL TABLE analytics_db.website_events (...) LOCATION 's3://website-analytics/analytics/';
CREATE EXTERNAL TABLE analytics_db.mobile_events (...) LOCATION 's3://mobile-app-analytics/analytics/';
CREATE EXTERNAL TABLE analytics_db.api_events (...) LOCATION 's3://api-analytics/analytics/';
```

**Query All Apps:**
```sql
SELECT 'Website' as app, COUNT(*) as views FROM analytics_db.website_events WHERE eventType = 'page_view'
UNION ALL
SELECT 'Mobile' as app, COUNT(*) as views FROM analytics_db.mobile_events WHERE eventType = 'page_view'
UNION ALL
SELECT 'API' as app, COUNT(*) as views FROM analytics_db.api_events WHERE eventType = 'page_view';
```

## Security

### IP Privacy
- IPs are hashed using SHA-256
- Only first 16 characters stored
- Cannot reverse-engineer original IP

### Bucket Authorization
- Requests with unauthorized buckets return 403
- Lambda validates bucket against whitelist
- Supports wildcard patterns for flexibility

### CORS
- Configurable per deployment
- Use '*' for public analytics
- Specify domain for backend-only

### Data Encryption
- S3 server-side encryption (SSE-S3) recommended
- Support for KMS via additionalPolicies
- HTTPS enforced via API Gateway


## Data Schema

Events are stored as JSON with this structure:

```typescript
{
  eventId: string;           // Unique event ID
  eventType: string;         // Event type
  timestamp: string;         // Client timestamp (ISO 8601)
  serverTimestamp: string;   // Server timestamp (ISO 8601)
  page: string;              // Page path
  sessionId: string;         // Session ID
  ip: string;                // Hashed IP (16 chars)
  location: {
    country: string;         // Country code
    city: string;            // City name
    region: string;          // Region/state
  };
  device: {
    device_type: string;     // 'mobile' | 'tablet' | 'desktop'
    browser: string;         // Browser name
  };
  viewport: {
    width: number;           // Viewport width
    height: number;          // Viewport height
  };
  referrer: string;          // Referrer URL
  userAgent: string;         // User agent string
  // ... any custom metadata
}
```

## Troubleshooting

### "Bucket not authorized" Error

Check Lambda environment variable `ALLOWED_BUCKETS`:
```bash
aws lambda get-function-configuration --function-name mycompany-analytics-tracker \
  --query 'Environment.Variables.ALLOWED_BUCKETS'
```

### No Data in Athena

1. Check S3 bucket for files:
   ```bash
   aws s3 ls s3://your-bucket/analytics/ --recursive
   ```

2. Run partition repair:
   ```sql
   MSCK REPAIR TABLE analytics_db.your_table;
   ```

3. Verify table location matches bucket

### High Costs

- Enable S3 Intelligent Tiering (transitions after 90 days)
- Use partition projection to avoid MSCK REPAIR queries
- Limit Athena query scope with WHERE clauses on partitions

## Contributing

This is a standalone package. Contributions welcome!

## License

MIT
