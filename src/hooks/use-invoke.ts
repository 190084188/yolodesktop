import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

export function useInvokeQuery<T>(
  key: string[],
  command: string,
  args?: Record<string, unknown>,
  options?: { enabled?: boolean }
) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => invoke<T>(command, args),
    ...options,
  });
}

export function useInvokeMutation<T = void>(
  command: string,
  options?: {
    invalidateKeys?: string[][];
    onSuccess?: (data: T) => void;
    onError?: (error: string) => void;
  }
) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  return useMutation<T, string, Record<string, unknown>>({
    mutationFn: (args) => invoke<T>(command, args),
    onSuccess: (data) => {
      if (options?.invalidateKeys) {
        for (const key of options.invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      options?.onSuccess?.(data);
    },
    onError: (err) => {
      message.error(err);
      options?.onError?.(err);
    },
  });
}
