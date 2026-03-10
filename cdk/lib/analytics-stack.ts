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
import { PolicyStatement, Effect, AnyPrincipal } from 'aws-cdk-lib/aws-iam';
import { Bucket, BucketPolicy } from 'aws-cdk-lib/aws-s3';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';

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
   * Attach a bucket policy to all non-wildcard buckets that denies all delete
   * actions (s3:DeleteObject, s3:DeleteObjectVersion, s3:DeleteBucket) for
   * every principal except the AWS account root user.
   * @default false
   */
  protectBucketsFromDelete?: boolean;

  /**
   * Enable versioning on all non-wildcard buckets so deleted objects can be
   * recovered from previous versions.
   * @default false
   */
  enableBucketVersioning?: boolean;

  /**
   * Name for an output bucket used for metadata storage.
   * When provided, CDK creates and manages the bucket with versioning enabled
   * and a deny-delete policy for all principals except the root user.
   */
  outputBucketName?: string;

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
  public readonly outputBucket?: Bucket;

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

    // Create output bucket for metadata storage
    if (config.outputBucketName) {
      this.outputBucket = new Bucket(this, 'OutputBucket', {
        bucketName: config.outputBucketName,
        versioned: true,
      });

      this.outputBucket.addToResourcePolicy(new PolicyStatement({
        sid: 'DenyDeleteExceptRootUser',
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ['s3:DeleteObject', 's3:DeleteObjectVersion', 's3:DeleteBucket'],
        resources: [this.outputBucket.bucketArn, `${this.outputBucket.bucketArn}/*`],
        conditions: {
          StringNotEquals: {
            'aws:PrincipalArn': `arn:aws:iam::${this.account}:root`,
          },
        },
      }));

      new CfnOutput(this, 'OutputBucketName', {
        value: this.outputBucket.bucketName,
        description: 'Output bucket for metadata storage',
        exportName: `${id}-OutputBucketName`,
      });

      new CfnOutput(this, 'OutputBucketArn', {
        value: this.outputBucket.bucketArn,
        description: 'Output bucket ARN',
        exportName: `${id}-OutputBucketArn`,
      });
    }

    // Apply bucket-level protections to all explicitly named (non-wildcard) buckets
    if (config.protectBucketsFromDelete || config.enableBucketVersioning) {
      const explicitBuckets = config.allowedBuckets.filter((b) => !b.includes('*'));
      explicitBuckets.forEach((bucketName) => {
        const bucket = Bucket.fromBucketName(this, `ProtectedBucket-${bucketName}`, bucketName);

        if (config.protectBucketsFromDelete) {
          const denyDelete = new PolicyStatement({
            sid: 'DenyDeleteExceptRootUser',
            effect: Effect.DENY,
            principals: [new AnyPrincipal()],
            actions: ['s3:DeleteObject', 's3:DeleteObjectVersion', 's3:DeleteBucket'],
            resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
            conditions: {
              StringNotEquals: {
                'aws:PrincipalArn': `arn:aws:iam::${this.account}:root`,
              },
            },
          });
          const bucketPolicy = new BucketPolicy(this, `BucketPolicy-${bucketName}`, { bucket });
          bucketPolicy.document.addStatements(denyDelete);
        }

        if (config.enableBucketVersioning) {
          new AwsCustomResource(this, `EnableVersioning-${bucketName}`, {
            onCreate: {
              service: 'S3',
              action: 'putBucketVersioning',
              parameters: {
                Bucket: bucketName,
                VersioningConfiguration: { Status: 'Enabled' },
              },
              physicalResourceId: PhysicalResourceId.of(`${bucketName}-versioning`),
            },
            onUpdate: {
              service: 'S3',
              action: 'putBucketVersioning',
              parameters: {
                Bucket: bucketName,
                VersioningConfiguration: { Status: 'Enabled' },
              },
              physicalResourceId: PhysicalResourceId.of(`${bucketName}-versioning`),
            },
            policy: AwsCustomResourcePolicy.fromStatements([
              new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ['s3:PutBucketVersioning'],
                resources: [bucket.bucketArn],
              }),
            ]),
          });
        }
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

}
