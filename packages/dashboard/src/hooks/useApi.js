import { useState, useEffect, useCallback } from 'react';
export function useApi(fetcher, deps = []) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const refetch = useCallback(() => {
        setLoading(true);
        setError(null);
        fetcher()
            .then(setData)
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, deps);
    useEffect(() => {
        refetch();
    }, [refetch]);
    return { data, loading, error, refetch };
}
//# sourceMappingURL=useApi.js.map