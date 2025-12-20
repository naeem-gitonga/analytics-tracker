#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
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
    allowedBuckets: [
      'test-analytics-gtng',
    ],
    corsOrigins: [
      'https://naeemgitonga.com',
    ],
    functionPrefix: 'analytics-prod',
    apiName: 'analytics-api-prod',
  },
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  }
);
