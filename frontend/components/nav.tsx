"use client";

import Link from "next/link";
import {HandHeart, MessageCircle, PackageX, UserRound} from "lucide-react";
import {Brand} from "@/components/brand";
import {useSession} from "@/components/session-provider";

export function Nav() {
    const {user, loading} = useSession();
    const initials = user?.display_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

    return (
        <header className="nav">
            <div className="container nav-inner">
                <Link href="/" className="brand" aria-label="Boomerang home">
                    <Brand />
                </Link>
                <nav className="nav-actions" aria-label="Report an item">
                    <Link href="/report?type=LOST" className="button report-lost nav-action">
                        <PackageX size={18} aria-hidden="true" />
                        Lost
                    </Link>
                    <Link href="/report?type=FOUND" className="button report-found nav-action">
                        <HandHeart size={18} aria-hidden="true" />
                        Found
                    </Link>
                </nav>
                <div className="nav-utilities">
                    <Link href="/chat" className="button chat-trigger nav-action">
                        <MessageCircle size={16} />
                        Chat
                    </Link>
                    <Link href="/account" className="button account-trigger nav-action"
                        aria-label={user ? `Account: ${user.display_name}` : "Sign in or create an account"}
                        title={user?.display_name ?? "Account"}>
                        {loading ? <span className="account-loading" aria-hidden="true" /> : user
                            ? <span className="user-avatar" aria-hidden="true">{initials || "U"}</span>
                            : <><UserRound size={16} /><span>Account</span></>}
                    </Link>
                </div>
            </div>
        </header>
    );
}
