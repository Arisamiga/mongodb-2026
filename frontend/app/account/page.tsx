"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {type FormEvent, useCallback, useEffect, useRef, useState} from "react";
import {ArrowRight, LogOut, RefreshCw, ShieldCheck, UserRound} from "lucide-react";
import {api, apiAll} from "@/lib/api";
import {useSession} from "@/components/session-provider";

type AuthResponse = {user: {id: string}};
type Report = {_id: string; title: string; type: "lost" | "found"; status: "open" | "matched" | "returned"};
type ReportStatus = Report["status"];
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

export default function AccountPage() {
    const {user, loading, refresh} = useSession();
    const router = useRouter();
    const [mode, setMode] = useState<"login" | "register">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [reports, setReports] = useState<Report[]>([]);
    const [reportStatus, setReportStatus] = useState<ReportStatus>("open");
    const [reportsLoading, setReportsLoading] = useState(false);
    const [reportsError, setReportsError] = useState("");
    const reportsRequest = useRef(0);

    const loadReports = useCallback(async (status: ReportStatus) => {
        const request = ++reportsRequest.current;
        setReportsLoading(true);
        setReportsError("");
        try {
            const result = await apiAll<Report>(`/items?mine=true&status=${status}`);
            if (request === reportsRequest.current) setReports(result);
        } catch (loadError) {
            if (request === reportsRequest.current) setReportsError(errorText(loadError));
        } finally {
            if (request === reportsRequest.current) setReportsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user) void loadReports(reportStatus);
        else { reportsRequest.current += 1; setReports([]); }
    }, [user, reportStatus, loadReports]);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setNotice("");
        if (mode === "register" && !displayName.trim()) {
            setError("Please enter a display name.");
            return;
        }
        if (mode === "register" && password.length < 12) {
            setError("Your password must be at least 12 characters.");
            return;
        }
        setBusy(true);
        try {
            const body = mode === "register" ? {email, password, display_name: displayName.trim()} : {email, password};
            await api<AuthResponse>(`/auth/${mode}`, {
                method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
            });
            await refresh();
            const destination = new URLSearchParams(window.location.search).get("next");
            router.replace(destination === "/report" || destination === "/report?type=FOUND" || destination === "/report?type=LOST" || destination === "/chat" ? destination : "/");
        } catch (submitError) {
            setError(errorText(submitError));
        } finally {
            setBusy(false);
        }
    }

    async function signOut() {
        setBusy(true);
        setError("");
        try {
            await api<unknown>("/auth/logout", {method: "POST"});
            await refresh();
            setNotice("You’re signed out.");
        } catch (signOutError) {
            setError(errorText(signOutError));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="container integration-page account-page">
            <header className="integration-heading">
                <span className="eyebrow green-text">YOUR BOOMERANG ACCOUNT</span>
                <h1>{user ? `Welcome, ${user.display_name}.` : "A little account goes a long way."}</h1>
                <p>Keep your conversations together and help good things find their way home.</p>
            </header>
            <div className="integration-card account-card">
                {loading ? <div className="integration-state" role="status">Checking your session…</div> : user ? <>
                    <div className="account-summary">
                        <span className="account-summary-icon"><UserRound size={22} /></span>
                        <div className="account-details"><strong>{user.display_name}</strong><span>{user.email}</span></div>
                        <div className="account-actions">
                            <Link className="button primary" href="/report">Report an item <ArrowRight size={16} /></Link>
                            <Link className="button secondary" href="/chat">Open chat</Link>
                            <button className="button secondary" type="button" onClick={signOut} disabled={busy}><LogOut size={16} /> {busy ? "Signing out…" : "Sign out"}</button>
                        </div>
                    </div>
                    <section className="my-reports" aria-labelledby="my-reports-title">
                        <div className="my-reports-heading">
                            <div><h2 id="my-reports-title">My reports</h2><p>Your lost and found item reports.</p></div>
                            <button className="icon-button" type="button" aria-label="Refresh reports" onClick={() => void loadReports(reportStatus)} disabled={reportsLoading}>
                                <RefreshCw size={16} className={reportsLoading ? "spin" : ""} />
                            </button>
                        </div>
                        <label className="reports-filter" htmlFor="report-status">Status
                            <select id="report-status" value={reportStatus} onChange={(event) => setReportStatus(event.target.value as ReportStatus)}>
                                <option value="open">Open</option>
                                <option value="matched">Matched</option>
                                <option value="returned">Returned</option>
                            </select>
                        </label>
                        {reportsError ? <p className="integration-error" role="alert">{reportsError}</p> : reportsLoading ?
                            <p className="integration-state" role="status">Loading reports…</p> : reports.length === 0 ?
                                <p className="reports-empty">No {reportStatus} reports yet.</p> :
                                    <ul className="report-items">{reports.map((report) => <li key={report._id}>
                                        <Link href={`/items/${encodeURIComponent(report._id)}`} className="report-item-link">
                                            <span className={`report-type-dot ${report.type}`}>{report.type === "lost" ? "Lost" : "Found"}</span>
                                            <span className="report-item-title">{report.title}</span>
                                            <span className="report-status">{report.status}</span>
                                            <ArrowRight size={16} aria-hidden="true" />
                                        </Link>
                                    </li>)}</ul>}
                    </section>
                </> : <>
                    <div className="account-tabs" role="tablist" aria-label="Account action">
                        <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "selected" : ""} onClick={() => {setMode("login"); setError("");}}>Sign in</button>
                        <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "selected" : ""} onClick={() => {setMode("register"); setError("");}}>Create account</button>
                    </div>
                    <form className="integration-form" onSubmit={submit}>
                        {mode === "register" && <label>Display name<input autoComplete="name" maxLength={80} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /><small>Shown to other members in private conversations.</small></label>}
                        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                        <label>Password<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 12 : 1} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />{mode === "register" && <small>Use at least 12 characters.</small>}</label>
                        {error && <p className="integration-error" role="alert">{error}</p>}
                        {notice && <p className="integration-success" role="status">{notice}</p>}
                        <button className="button primary integration-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}{!busy && <ArrowRight size={16} />}</button>
                    </form>
                </>}
                        {error && user && <p className="integration-error" role="alert">{error}</p>}
            </div>
            <p className="integration-footnote"><ShieldCheck size={15} /> Your account is protected by a secure, HttpOnly session.</p>
        </section>
    );
}
