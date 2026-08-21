import { type AxiosRequestConfig } from "axios";
import { axiosInstance } from "./https";

// Generic API helper
export const apiHelper = {
  // GET request
  get: async <T>(path: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await axiosInstance.get<T>(path, config);
    return response.data;
  },

  // POST request  
  post: async <T, D = unknown>(path: string, data?: D, config?: AxiosRequestConfig): Promise<T> => {
    const response = await axiosInstance.post<T>(path, data, config);
    return response.data;
  },

  // PUT request
  put: async <T, D = unknown>(path: string, data?: D, config?: AxiosRequestConfig): Promise<T> => {
    const response = await axiosInstance.put<T>(path, data, config);
    return response.data;
  },

  // PATCH request
  patch: async <T, D = unknown>(path: string, data?: D, config?: AxiosRequestConfig): Promise<T> => {
    const response = await axiosInstance.patch<T>(path, data, config);
    return response.data;
  },

  // DELETE request
  delete: async <T>(path: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await axiosInstance.delete<T>(path, config);
    return response.data;
  },
};

