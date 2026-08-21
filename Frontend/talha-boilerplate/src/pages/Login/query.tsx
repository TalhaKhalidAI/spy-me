import { apiHelper } from "@/api/http/axosMethod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import type { LoginRequest, LoginResponse } from "./types";

export const authKeys = {
  currentUser: ['auth', 'currentUser'],
};

export const loginApi = async (data: LoginRequest): Promise<LoginResponse> => {
  const response = await apiHelper.post<LoginResponse, LoginRequest>(
    "/users/login",
    data,
    {
      params: { cookie_login: true },
    }
  );
  return response;
};

export const logoutApi = async (): Promise<unknown> => {
  const response = await apiHelper.post("/users/logout", {}, { skipToast: true });
  return response;
};

export const useLoginMutation = () => {
  return useMutation({
    mutationFn: loginApi,
    onSuccess: (data: LoginResponse) => {
      console.log('✅ Login successful:', data?.user?.username || 'User');
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || error.message || 'Login failed';
      console.error('Login failed:', message);
    },
  });
};

export const useLogoutMutation = () => {
  const logoutStore = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutApi,
    onSettled: () => {
      logoutStore();
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });
};