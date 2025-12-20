import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Callback,
  Context,
} from 'aws-lambda';

import AnalyticsService from './analytics-service';

type TrackHandler = (
  event: APIGatewayProxyEvent,
  _context?: Context,
  _callback?: Callback
) => Promise<APIGatewayProxyResult>;

export const track: TrackHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const analyticsService = new AnalyticsService(event);
  return analyticsService.handle();
};

export const handler = track;
