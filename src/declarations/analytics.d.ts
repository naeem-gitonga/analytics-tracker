/**
 * Analytics event sent from client
 */
export interface AnalyticsEvent {
  bucket: string; // S3 bucket to write to (required in request)
  eventType: 'page_view' | 'scroll_complete' | string;
  timestamp: string;
  page: string;
  userAgent: string;
  viewport: ViewportInfo;
  sessionId: string;
  referrer?: string;
  metadata?: Record<string, any>;
}

/**
 * Viewport dimensions
 */
export interface ViewportInfo {
  width: number;
  height: number;
}

/**
 * Device type and browser information
 */
export interface DeviceInfo {
  device_type: 'mobile' | 'tablet' | 'desktop';
  browser: string;
}

/**
 * Geographic location information
 */
export interface Location {
  country: string;
  city: string;
  region: string;
}

/**
 * Complete analytics record stored in S3
 */
export interface AnalyticsRecord {
  eventId: string;
  eventType: string;
  timestamp: string;
  serverTimestamp: string;
  page: string;
  sessionId: string;
  ip: string;
  location: Location;
  device: DeviceInfo;
  viewport: ViewportInfo;
  referrer: string;
  userAgent: string;
  userid: string | null;
  [key: string]: any;
}
