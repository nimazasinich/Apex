export type NewsApiEndpoint = 'everything' | 'top-headlines';
export type NewsApiSortBy = 'relevancy' | 'popularity' | 'publishedAt';

/** Non-secret query options persisted in Settings (safe to expose to the browser). */
export interface NewsApiQueryOptions {
  endpoint?: NewsApiEndpoint;
  sortBy?: NewsApiSortBy;
  language?: string;
  pageSize?: number;
  lookbackDays?: number;
  domains?: string;
  excludeDomains?: string;
  searchIn?: string;
  sources?: string;
  category?: string;
  country?: string;
  includeCryptoTerms?: boolean;
  /** Reject headlines without cryptocurrency terms after the provider response. */
  cryptoOnly?: boolean;
}
