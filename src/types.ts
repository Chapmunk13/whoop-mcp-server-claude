// WHOOP API Response Types
export interface WhoopUserProfile {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface WhoopBodyMeasurements {
  height_meter: number;
  weight_kilogram: number;
  max_heart_rate: number;
}

export interface WhoopCycleScore {
  strain: number;
  kilojoule: number;
  average_heart_rate: number;
  max_heart_rate: number;
}

export interface WhoopCycle {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  score_state: string;
  score: WhoopCycleScore;
}

export interface WhoopCycleCollection {
  records: WhoopCycle[];
  next_token?: string;
}

export interface WhoopRecoveryScore {
  score_state: string;
  score?: {
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage: number;
    skin_temp_celsius: number;
  };
}

export interface WhoopRecovery {
  id: string;
  v1_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  score_state: string;
  score?: WhoopRecoveryScore['score'];
}

export interface WhoopRecoveryCollection {
  records: WhoopRecovery[];
  next_token?: string;
}

export interface WhoopSleepStageSummary {
  total_in_bed_time_milli: number;
  total_awake_time_milli: number;
  total_no_data_time_milli: number;
  total_light_sleep_time_milli: number;
  total_slow_wave_sleep_time_milli: number;
  total_rem_sleep_time_milli: number;
  sleep_cycle_count: number;
  disturbance_count: number;
}

export interface WhoopSleepNeeded {
  baseline_milli: number;
  need_from_sleep_debt_milli: number;
  need_from_recent_strain_milli: number;
  need_from_recent_nap_milli: number;
}

export interface WhoopSleepScore {
  stage_summary: WhoopSleepStageSummary;
  sleep_needed: WhoopSleepNeeded;
  respiratory_rate: number;
  sleep_performance_percentage: number;
  sleep_consistency_percentage: number;
  sleep_efficiency_percentage: number;
}

export interface WhoopSleep {
  id: string;
  v1_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: string;
  score?: WhoopSleepScore;
}

export interface WhoopSleepCollection {
  records: WhoopSleep[];
  next_token?: string;
}

export interface WhoopWorkoutZoneDurations {
  zone_zero_milli: number;
  zone_one_milli: number;
  zone_two_milli: number;
  zone_three_milli: number;
  zone_four_milli: number;
  zone_five_milli: number;
}

export interface WhoopWorkoutScore {
  strain: number;
  average_heart_rate: number;
  max_heart_rate: number;
  kilojoule: number;
  percent_recorded: number;
  distance_meter?: number;
  altitude_gain_meter?: number;
  altitude_change_meter?: number;
  zone_durations?: WhoopWorkoutZoneDurations;
}

export interface WhoopWorkout {
  id: string;
  v1_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_name: string;
  sport_id: number;
  score_state: string;
  score?: WhoopWorkoutScore;
}

export interface WhoopWorkoutCollection {
  records: WhoopWorkout[];
  next_token?: string;
}

// MCP Server Types
export interface WhoopApiConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken?: string;
  /** Persisted refresh token. Only issued when the `offline` scope is requested. */
  refreshToken?: string;
  /** Epoch ms at which the access token expires. */
  expiresAt?: number;
  /** Override the token-store location. Defaults to whoop-tokens.json at the package root. */
  tokenStorePath?: string;
}

export interface WhoopTokenStore {
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: number;
  expiresIn?: number;
  scope?: string;
  timestamp?: string;
}

export interface PaginationParams {
  limit?: number;
  start?: string;
  end?: string;
  nextToken?: string;
}
