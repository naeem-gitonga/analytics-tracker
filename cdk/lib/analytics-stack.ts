import * as path from 'path';
import { execSync } from 'child_process';
import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Code, Runtime, Function } from 'aws-cdk-lib/aws-lambda';
import {
  LambdaIntegration,
  RestApi,
  Cors,
  EndpointType,
  MethodLoggingLevel,
} from 'aws-cdk-lib/aws-apigateway';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

export interface AnalyticsTrackerConfig {
  /**
   * List of S3 bucket names (or patterns with wildcards) that this tracker can write to
   * Examples:
   *   - ['my-app-analytics', 'my-other-app-analytics']
   *   - ['*-analytics'] // All buckets ending with -analytics
   *   - ['analytics-*'] // All buckets starting with analytics-
   */
  allowedBuckets: string[];

  /**
   * CORS origin(s) for the API Gateway
   * Use '*' to allow all origins, or specify specific domains
   * Examples:
   *   - '*' (allow all)
   *   - 'https://example.com'
   *   - ['https://example.com', 'https://staging.example.com']
   */
  corsOrigins?: string | string[];

  /**
   * Function name prefix
   * Final name will be: `${functionPrefix}-analytics-tracker`
   */
  functionPrefix?: string;

  /**
   * API Gateway name
   */
  apiName?: string;

  /**
   * Enable detailed CloudWatch metrics
   * @default true
   */
  enableMetrics?: boolean;

  /**
   * Lambda timeout in seconds
   * @default 10
   */
  lambdaTimeout?: number;

  /**
   * Additional IAM policy statements for the Lambda function
   * Use this to grant additional permissions (e.g., KMS, DynamoDB)
   */
  additionalPolicies?: PolicyStatement[];

  /**
   * Enable API Gateway access logging
   * @default true
   */
  enableAccessLogs?: boolean;

  /**
   * API Gateway endpoint type
   * @default EndpointType.REGIONAL
   */
  endpointType?: EndpointType;
}

export class AnalyticsTrackerStack extends Stack {
  public readonly api: RestApi;
  public readonly trackingFunction: Function;

  constructor(scope: Construct, id: string, config: AnalyticsTrackerConfig, props?: StackProps) {
    super(scope, id, props);

    // Validate configuration
    if (!config.allowedBuckets || config.allowedBuckets.length === 0) {
      throw new Error('allowedBuckets must contain at least one bucket pattern');
    }

    const functionPrefix = config.functionPrefix || 'default';
    const apiName = config.apiName || 'analytics-tracker-api';
    const corsOrigins = config.corsOrigins || '*';
    const corsOriginsArray = Array.isArray(corsOrigins) ? corsOrigins : [corsOrigins];
    const enableMetrics = config.enableMetrics ?? true;
    const lambdaTimeout = config.lambdaTimeout || 10;
    const enableAccessLogs = config.enableAccessLogs ?? true;
    const endpointType = config.endpointType || EndpointType.EDGE;

    // Create Lambda function
    this.trackingFunction = new Function(this, 'AnalyticsTrackerFunction', {
      functionName: `${functionPrefix}-analytics-tracker`,
      runtime: Runtime.NODEJS_22_X,
      handler: 'track/handler.track',
      code: Code.fromAsset(path.join(__dirname, '../../src'), {
        bundling: {
          image: Runtime.NODEJS_22_X.bundlingImage,
          command: [
            'bash',
            '-c',
            [
              'npm install -g typescript @types/node @types/aws-lambda @aws-sdk/client-s3',
              'cp -r /asset-input/. /tmp/build/',
              'cd /tmp/build',
              'tsc track/handler.ts track/analytics-service.ts declarations/analytics.d.ts --outDir /asset-output --esModuleInterop --module commonjs --target es2020 --lib es2020 --skipLibCheck',
            ].join(' && '),
          ],
          user: 'root',
          local: {
            tryBundle(outputDir: string) {
              try {
                execSync('which tsc', { stdio: 'pipe' });
              } catch {
                return false;
              }

              const srcPath = path.join(__dirname, '../../src');
              execSync(
                `tsc ${path.join(srcPath, 'track/handler.ts')} ${path.join(srcPath, 'track/analytics-service.ts')} ${path.join(srcPath, 'declarations/analytics.d.ts')} --outDir ${outputDir} --esModuleInterop --module commonjs --target es2020 --lib es2020 --skipLibCheck`,
                { stdio: 'inherit' }
              );

              return true;
            },
          },
        },
      }),
      timeout: Duration.seconds(lambdaTimeout),
      environment: {
        ALLOWED_BUCKETS: config.allowedBuckets.join(','),
        CORS_ORIGINS: corsOriginsArray.join(','),
      },
    });

    // Create fine-grained IAM policy for S3 access
    const s3Policy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        's3:PutObject',
        's3:PutObjectAcl',
      ],
      resources: config.allowedBuckets.map((bucket) => {
        // Support wildcard patterns
        if (bucket.includes('*')) {
          return `arn:aws:s3:::${bucket}/analytics/*`;
        }
        return `arn:aws:s3:::${bucket}/analytics/*`;
      }),
    });

    this.trackingFunction.addToRolePolicy(s3Policy);

    // Add any additional policies
    if (config.additionalPolicies) {
      config.additionalPolicies.forEach((policy) => {
        this.trackingFunction.addToRolePolicy(policy);
      });
    }

    // Create API Gateway
    this.api = new RestApi(this, 'AnalyticsTrackerApi', {
      restApiName: apiName,
      description: 'Multi-tenant analytics tracking API',
      endpointTypes: [endpointType],
      deployOptions: {
        stageName: 'prod',
        metricsEnabled: enableMetrics,
        loggingLevel: enableAccessLogs ? MethodLoggingLevel.INFO : MethodLoggingLevel.OFF,
        dataTraceEnabled: false, // Don't log request/response bodies (PII concerns)
      },
      defaultCorsPreflightOptions: {
        allowOrigins: corsOrigins === '*' ? Cors.ALL_ORIGINS : corsOriginsArray,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'X-Requested-With', 'Authorization'],
        allowCredentials: false,
      },
    });

    // Add /track endpoint
    const trackResource = this.api.root.addResource('track');
    trackResource.addMethod('POST', new LambdaIntegration(this.trackingFunction));

    // Outputs
    new CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'Analytics Tracker API endpoint',
      exportName: `${id}-ApiUrl`,
    });

    new CfnOutput(this, 'FunctionName', {
      value: this.trackingFunction.functionName,
      description: 'Analytics Tracker Lambda function name',
      exportName: `${id}-FunctionName`,
    });

    new CfnOutput(this, 'FunctionArn', {
      value: this.trackingFunction.functionArn,
      description: 'Analytics Tracker Lambda function ARN',
      exportName: `${id}-FunctionArn`,
    });

    new CfnOutput(this, 'AllowedBuckets', {
      value: config.allowedBuckets.join(', '),
      description: 'Allowed S3 buckets for analytics',
    });
  }

  /**
   * Grant an API Gateway permission to invoke this tracker
   * Use this when you have multiple API Gateways that need to call this tracker
   */
  public grantInvokeToApiGateway(apiGatewayArn: string): void {
    this.trackingFunction.addPermission('AllowApiGatewayInvoke', {
      principal: new (require('aws-cdk-lib/aws-iam').ServicePrincipal)('apigateway.amazonaws.com'),
      sourceArn: apiGatewayArn,
    });
  }

  /**
   * Grant write access to an additional bucket
   * Use this to dynamically add buckets after stack creation
   */
  public grantWriteToBucket(bucketName: string): void {
    const policy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:PutObject', 's3:PutObjectAcl'],
      resources: [`arn:aws:s3:::${bucketName}/analytics/*`],
    });

    this.trackingFunction.addToRolePolicy(policy);
  }
}
