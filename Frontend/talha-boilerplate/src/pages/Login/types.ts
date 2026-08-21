// src/pages/Login/types.ts

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginQueryParams {
  cookie_login?: boolean;
}

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  user_role: string;
  is_active: boolean;
  disabled: boolean;
}

export interface LoginResponse {
  access_token: string | null;
  token_type: string;
  user: User;
}

export interface LoginCredentials {
  accessToken: string | null;
  user: User;
}