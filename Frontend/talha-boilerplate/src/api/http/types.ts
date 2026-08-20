export interface ApiResponse<T = unknown> {
  Status: boolean;
  Data: T;
  Message?: string;
  Metadata?: {
    page?: number;
    total?: number;
    [key: string]: unknown;
  };
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
}

export interface UserData {
  id: string;
  email: string;
  name: string;
  roles: string[];
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}
