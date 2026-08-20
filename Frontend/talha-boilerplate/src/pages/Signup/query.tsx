
// src/pages/Signup/query.ts

import { apiHelper } from "@/api/http/axosMethod";
import { useMutation } from "@tanstack/react-query";
import type { SignupRequest, SignupResponse } from "./types";

// ============================================================
// API FUNCTION
// ============================================================

export const signupApi = async (data: SignupRequest): Promise<SignupResponse> => {
  const response = await apiHelper.post<SignupResponse, SignupRequest>(
    "/users/signup",
    data
  );
  return response;
};

// ============================================================
// USE MUTATION HOOK
// ============================================================

export const useSignupMutation = () => {
  return useMutation({
    mutationFn: signupApi,
    onSuccess: (data: SignupResponse) => {
      console.log('✅ Signup successful:', data.user.username);
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail;
      
      // Handle 422 validation errors
      if (Array.isArray(detail)) {
        const messages = detail.map((err: any) => err.msg).join(', ');
        console.error('Validation errors:', messages);
      } else {
        console.error('Signup failed:', detail || error.message);
      }
    },
  });
};