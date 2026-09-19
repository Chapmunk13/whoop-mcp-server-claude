import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  WhoopApiConfig,
  WhoopTokenStore,
  WhoopUserProfile,
  WhoopBodyMeasurements,
  WhoopCycle,
  WhoopCycleCollection,
  WhoopRecovery,
  WhoopRecoveryCollection,
  WhoopSleep,
  WhoopSleepCollection,
  WhoopWorkout,
  WhoopWorkoutCollection,
  PaginationParams
} from './types.js';

/** Access tokens live ~1h. Refresh this many ms before expiry rather than waiting for a 401. */
const REFRESH_SKEW_MS = 60_000;

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TOKEN_STORE = path.join(PACKAGE_ROOT, 'whoop-tokens.json');

export class WhoopApiClient {
  private client: AxiosInstance;
  private config: WhoopApiConfig;
  private tokenStorePath: string;
  private refreshInFlight: Promise<void> | null = null;

  constructor(config: WhoopApiConfig) {
    this.config = config;
    this.tokenStorePath = config.tokenStorePath
      ?? process.env.WHOOP_TOKEN_STORE
      ?? DEFAULT_TOKEN_STORE;
    this.loadTokens();

    this.client = axios.create({
      baseURL: 'https://api.prod.whoop.com/developer/v2',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor: proactively refresh an expired token, then attach it.
    this.client.interceptors.request.use(async (config) => {
      await this.ensureFreshToken();
      if (this.config.accessToken) {
        config.headers.Authorization = `Bearer ${this.config.accessToken}`;
      }
      return config;
    });

    // Response interceptor: a 401 still slips through when expiresAt is unknown or wrong
    // (for example a token minted before this store existed). Refresh once and retry.
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const original = error.config as (InternalAxiosRequestConfig & { _whoopRetried?: boolean }) | undefined;
        if (error.response?.status !== 401 || !original || original._whoopRetried) {
          throw error;
        }
        if (!this.config.refreshToken) {
          throw error; // nothing to refresh with; caller surfaces the re-auth recipe
        }
        original._whoopRetried = true;
        await this.performRefresh();
        if (this.config.accessToken) {
          original.headers.Authorization = `Bearer ${this.config.accessToken}`;
        }
        return this.client.request(original);
      }
    );
  }

  setAccessToken(accessToken: string) {
    this.config.accessToken = accessToken;
  }

  /** True when a refresh token is on hand, i.e. the `offline` scope was granted. */
  canAutoRefresh(): boolean {
    return Boolean(this.config.refreshToken);
  }

  private loadTokens(): void {
    try {
      if (!fs.existsSync(this.tokenStorePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.tokenStorePath, 'utf8')) as WhoopTokenStore;
      if (raw.accessToken && !this.config.accessToken) this.config.accessToken = raw.accessToken;
      if (raw.refreshToken) this.config.refreshToken = raw.refreshToken;
      if (typeof raw.expiresAt === 'number') this.config.expiresAt = raw.expiresAt;
    } catch {
      // A malformed store must not stop the server booting. A 401 will drive re-auth.
    }
  }

  private persistTokens(scope?: string): void {
    const payload: WhoopTokenStore = {
      accessToken: this.config.accessToken,
      refreshToken: this.config.refreshToken ?? null,
      expiresAt: this.config.expiresAt,
      scope,
      timestamp: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(this.tokenStorePath, JSON.stringify(payload, null, 2));
    } catch {
      // Non-fatal: the in-memory token still works for this process.
    }
  }

  private async ensureFreshToken(): Promise<void> {
    if (!this.config.refreshToken) return;
    const expiresAt = this.config.expiresAt;
    if (typeof expiresAt !== 'number') return;
    if (Date.now() < expiresAt - REFRESH_SKEW_MS) return;
    await this.performRefresh();
  }

  /** Refresh, collapsing concurrent callers onto a single in-flight request. */
  private async performRefresh(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      try {
        await this.refreshToken();
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
  }

  // User endpoints
  async getUserProfile(): Promise<WhoopUserProfile> {
    const response = await this.client.get('/user/profile/basic');
    return response.data;
  }

  async getUserBodyMeasurements(): Promise<WhoopBodyMeasurements> {
    const response = await this.client.get('/user/measurement/body');
    return response.data;
  }

  async revokeUserAccess(): Promise<void> {
    await this.client.delete('/user/access');
  }

  // Cycle endpoints
  async getCycleById(cycleId: number): Promise<WhoopCycle> {
    const response = await this.client.get(`/cycle/${cycleId}`);
    return response.data;
  }

  async getCycleCollection(params?: PaginationParams): Promise<WhoopCycleCollection> {
    const queryParams = new URLSearchParams();
    
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.start) queryParams.append('start', params.start);
    if (params?.end) queryParams.append('end', params.end);
    if (params?.nextToken) queryParams.append('nextToken', params.nextToken);

    const url = `/cycle${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get(url);
    return response.data;
  }

  async getSleepForCycle(cycleId: number): Promise<WhoopSleep[]> {
    const response = await this.client.get(`/cycle/${cycleId}/sleep`);
    return response.data;
  }

  // Recovery endpoints
  async getRecoveryCollection(params?: PaginationParams): Promise<WhoopRecoveryCollection> {
    const queryParams = new URLSearchParams();
    
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.start) queryParams.append('start', params.start);
    if (params?.end) queryParams.append('end', params.end);
    if (params?.nextToken) queryParams.append('nextToken', params.nextToken);

    const url = `/recovery${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get(url);
    return response.data;
  }

  async getRecoveryForCycle(cycleId: number): Promise<WhoopRecovery[]> {
    const response = await this.client.get(`/cycle/${cycleId}/recovery`);
    return response.data;
  }

  // Sleep endpoints
  async getSleepById(sleepId: string): Promise<WhoopSleep> {
    const response = await this.client.get(`/activity/sleep/${sleepId}`);
    return response.data;
  }

  async getSleepCollection(params?: PaginationParams): Promise<WhoopSleepCollection> {
    const queryParams = new URLSearchParams();
    
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.start) queryParams.append('start', params.start);
    if (params?.end) queryParams.append('end', params.end);
    if (params?.nextToken) queryParams.append('nextToken', params.nextToken);

    const url = `/activity/sleep${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get(url);
    return response.data;
  }

  // Workout endpoints
  async getWorkoutById(workoutId: string): Promise<WhoopWorkout> {
    const response = await this.client.get(`/activity/workout/${workoutId}`);
    return response.data;
  }

  async getWorkoutCollection(params?: PaginationParams): Promise<WhoopWorkoutCollection> {
    const queryParams = new URLSearchParams();
    
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.start) queryParams.append('start', params.start);
    if (params?.end) queryParams.append('end', params.end);
    if (params?.nextToken) queryParams.append('nextToken', params.nextToken);

    const url = `/activity/workout${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get(url);
    return response.data;
  }

  // OAuth endpoints
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      // `offline` is required for WHOOP to issue a refresh token. Without it every access
      // token silently dies after ~1h and the user has to re-authorize by hand.
      scope: 'offline read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement'
    });
    
    if (state) {
      params.append('state', state);
    }
    
    return `https://api.prod.whoop.com/oauth/oauth2/auth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const formData = new URLSearchParams();
    formData.append('client_id', this.config.clientId);
    formData.append('client_secret', this.config.clientSecret);
    formData.append('code', code);
    formData.append('grant_type', 'authorization_code');
    formData.append('redirect_uri', this.config.redirectUri);

    const response = await axios.post('https://api.prod.whoop.com/oauth/oauth2/token', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    this.adoptTokenResponse(response.data);
    return response.data;
  }

  /**
   * Refresh the access token. Omit the argument to use the stored refresh token.
   * WHOOP rotates refresh tokens, so the new one is persisted; dropping it would put the
   * user right back to manual re-authorization on the next expiry.
   */
  async refreshToken(refreshToken?: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const token = refreshToken ?? this.config.refreshToken;
    if (!token) {
      throw new Error(
        'No refresh token available. Authorize once with the `offline` scope via ' +
        'whoop-get-authorization-url, then whoop-exchange-code-for-token.'
      );
    }

    const formData = new URLSearchParams();
    formData.append('client_id', this.config.clientId);
    formData.append('client_secret', this.config.clientSecret);
    formData.append('refresh_token', token);
    formData.append('grant_type', 'refresh_token');
    // WHOOP requires the scope to be restated on refresh to keep offline access alive.
    formData.append('scope', 'offline');

    const response = await axios.post('https://api.prod.whoop.com/oauth/oauth2/token', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    this.adoptTokenResponse(response.data);
    return response.data;
  }

  /** Take a token response into memory and onto disk. */
  private adoptTokenResponse(data: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }): void {
    this.config.accessToken = data.access_token;
    if (data.refresh_token) this.config.refreshToken = data.refresh_token;
    if (typeof data.expires_in === 'number') {
      this.config.expiresAt = Date.now() + data.expires_in * 1000;
    }
    this.persistTokens(data.scope);
  }
}
