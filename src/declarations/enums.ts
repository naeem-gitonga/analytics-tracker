export enum ServerErrors {
  ItBroke = 'Something broke',
  RouteNotFound = "We don't have a method to handle this request:",
  CannotConnectDb = 'Cannot connect to database.',
  FailedToSaveAnalytics = 'Failed to save analytics event',
  InvalidRequest = 'Invalid request',
  UnauthorizedOrigin = 'Unauthorized origin',
}
