#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PolicyStatement, Effect, ArnPrincipal } from 'aws-cdk-lib/aws-iam';
import { AnalyticsTrackerStack } from '../lib/analytics-stack';

const app = new cdk.App();

// Staging configuration
new AnalyticsTrackerStack(
  app,
  'AnalyticsTrackerStaging',
  {
    allowedBuckets: [
      'test-analytics-gtng',
    ],
    corsOrigins: [
      'https://staging.naeemgitonga.com',
    ],
    functionPrefix: 'analytics-staging',
    apiName: 'analytics-api-staging',
    outputBucketName: 'test-analytics-gtng-output-staging',
    protectBucketsFromDelete: true,
  },
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  }
);

// Production configuration
new AnalyticsTrackerStack(
  app,
  'AnalyticsTrackerProd',
  {
    managedBuckets: [
      'test-analytics-gtng',
    ],
    corsOrigins: [
      'https://naeemgitonga.com',
    ],
    functionPrefix: 'analytics-prod',
    apiName: 'analytics-api-prod',
    outputBucketName: 'test-analytics-gtng-output',
    additionalBucketPolicyStatements: [
      new PolicyStatement({
        sid: 'AthenaQueryResults',
        effect: Effect.ALLOW,
        principals: [new ArnPrincipal('arn:aws:iam::320887606173:user/naeem_gitonga_web_app')],
        actions: ['s3:Get*', 's3:PutObject', 's3:List*'],
        resources: [
          'arn:aws:s3:::test-analytics-gtng',
          'arn:aws:s3:::test-analytics-gtng/*',
        ],
      }),
    ],
  },
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  }
);
