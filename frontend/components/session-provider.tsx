"use client";

import {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react";
import {api, type User} from "@/lib/api";

type SessionValue = {user: User | null; loading: boolean; refresh: () => Promise<void>};
const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({children}: {children: React.ReactNode}) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setUser(await api<User>("/auth/me"));
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    const value = useMemo(() => ({user, loading, refresh}), [user, loading, refresh]);
    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
    const session = useContext(SessionContext);
    if (!session) throw new Error("useSession must be used inside SessionProvider");
    return session;
}
