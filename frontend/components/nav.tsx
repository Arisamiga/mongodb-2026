"use client";

import Link from "next/link";
import {MessageCircle, X} from "lucide-react";
import {useState} from "react";
import {Brand} from "@/components/brand";

export function Nav() {
    const [chatOpen, setChatOpen] = useState(false);

    return (
        <header className="nav">
            <div className="container nav-inner">
                <Link href="/" className="brand" aria-label="Boomerang home">
                    <Brand />
                </Link>
                <div className="nav-actions" aria-label="Report an item or open chat">
                    <Link href="/report?type=LOST" className="button report-lost nav-action">
                        Lost
                    </Link>
                    <Link href="/report?type=FOUND" className="button report-found nav-action">
                        Found
                    </Link>
                    <button
                        type="button"
                        className="button chat-trigger nav-action"
                        aria-expanded={chatOpen}
                        aria-controls="demo-chat-panel"
                        onClick={() => setChatOpen((open) => !open)}
                    >
                        <MessageCircle size={16} />
                        Chat
                    </button>
                </div>
            </div>
            {chatOpen && (
                <aside className="demo-chat" id="demo-chat-panel" aria-label="Demo chat">
                    <div className="demo-chat-heading">
                        <span className="demo-chat-icon"><MessageCircle size={18} /></span>
                        <div>
                            <strong>Community chat</strong>
                            <span>Here to help things find their way back</span>
                        </div>
                        <button
                            className="chat-close"
                            type="button"
                            aria-label="Close chat"
                            onClick={() => setChatOpen(false)}
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <div className="demo-chat-content">
                        <span className="chat-time">TODAY</span>
                        <p className="chat-message">Hi there! Need help reporting something lost or found?</p>
                        <p className="chat-placeholder">Chat is just a demo for now.</p>
                    </div>
                    <div className="demo-chat-input" aria-disabled="true">
                        <span>Messaging is coming soon</span>
                        <MessageCircle size={16} />
                    </div>
                </aside>
            )}
        </header>
    );
}
