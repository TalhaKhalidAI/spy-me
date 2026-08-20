// src/pages/Signup/types.ts

export interface SignupRequest {
  username: string;
  email: string;
  password: string;
  full_name: string;
}

export interface SignupResponse {
  user: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    user_role: string;
    is_active: boolean;
    disabled: boolean;
  };
}

export interface SignupError {
  detail: string | Array<{
    type: string;
    loc: string[];
    msg: string;
  }>;
}