interface UseApiResult<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
}
export declare function useApi<T>(fetcher: () => Promise<T>, deps?: unknown[]): UseApiResult<T>;
export {};
//# sourceMappingURL=useApi.d.ts.map