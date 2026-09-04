import { apiHelper } from "@/api/http/axosMethod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const adminUserKeys = {
  allUsers: ['admin', 'users'],
};

// API Functions
export const getAllUsersApi = async () => {
  const response = await apiHelper.get("/users");
  return response?.data?.users || response?.users || [];
};

export const createUserApi = async (data: any) => {
  const response = await apiHelper.post("/users", data);
  return response;
};

export const updateUserPasswordApi = async ({ id, password }: { id: string; password: string }) => {
  const response = await apiHelper.put(`/users/${id}/password`, { password });
  return response;
};

export const updateProfileApi = async (data: any) => {
  const response = await apiHelper.patch(`/users/update-me`, data);
  return response;
};

export const deleteMeApi = async () => {
  const response = await apiHelper.delete(`/users/delete-me`);
  return response;
};

export const getDeletedUsersApi = async () => {
  const response = await apiHelper.get(`/users/deleted`);
  return response?.data?.users || response?.users || [];
};

export const restoreUserApi = async (id: string) => {
  const response = await apiHelper.post(`/users/restore/${id}`);
  return response;
};

export const adminUpdateUserApi = async ({ id, data }: { id: string; data: any }) => {
  const response = await apiHelper.patch(`/users/${id}`, data);
  return response;
};

// React Query Hooks
export const useGetAllUsers = () => {
  return useQuery({
    queryKey: adminUserKeys.allUsers,
    queryFn: getAllUsersApi,
  });
};

export const useGetDeletedUsers = (options?: any) => {
  return useQuery({
    queryKey: ['admin', 'deletedUsers'],
    queryFn: getDeletedUsersApi,
    ...options,
  });
};

export const useCreateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createUserApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.allUsers });
    },
  });
};

export const useUpdatePasswordMutation = () => {
  return useMutation({
    mutationFn: updateUserPasswordApi,
  });
};

export const useUpdateProfileMutation = () => {
  return useMutation({
    mutationFn: updateProfileApi,
  });
};

export const useAdminUpdateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminUpdateUserApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.allUsers });
    },
  });
};

export const useDeleteMeMutation = () => {
  return useMutation({
    mutationFn: deleteMeApi,
  });
};

export const useRestoreUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: restoreUserApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.allUsers });
      queryClient.invalidateQueries({ queryKey: ['admin', 'deletedUsers'] });
    },
  });
};
