/** @jest-environment node */
import { ServerErrors } from '../enums';

describe('ServerErrors enum', () => {
  it('exposes general error values', () => {
    expect(ServerErrors.ItBroke).toBe('Something broke');
    expect(ServerErrors.RouteNotFound).toBe(
      "We don't have a method to handle this request:"
    );
    expect(ServerErrors.CannotConnectDb).toBe('Cannot connect to database.');
  });

  it('exposes analytics-specific error values', () => {
    expect(ServerErrors.FailedToSaveAnalytics).toBe(
      'Failed to save analytics event'
    );
    expect(ServerErrors.InvalidRequest).toBe('Invalid request');
    expect(ServerErrors.UnauthorizedOrigin).toBe('Unauthorized origin');
  });
});
