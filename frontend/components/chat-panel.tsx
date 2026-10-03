"use client";

import Link from "next/link";
import {type FormEvent, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {MessageCircle, RefreshCw, Send, ShieldCheck} from "lucide-react";
import {api, apiAll} from "@/lib/api";
import {useSession} from "@/components/session-provider";

type Conversation = {id: string; lost_id: string; found_id: string; members: {id: string; display_name: string}[]; score: number; created_at: string};
type Message = {id: string; conversation_id: string; sender_id: string; body: string; created_at: string};
const messageError = (error: unknown) => error instanceof Error ? error.message : "Couldn’t load this conversation. Please try again.";
const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, {dateStyle: "medium", timeStyle: "short"});
};

export function ChatPanel() {
    const {user, loading: sessionLoading} = useSession();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [draft, setDraft] = useState("");
    const [listLoading, setListLoading] = useState(true);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [listError, setListError] = useState("");
    const [messagesError, setMessagesError] = useState("");
    const [sendError, setSendError] = useState("");
    const messagesRequest = useRef(0);
    const currentId = useRef(selectedId);
    currentId.current = selectedId;

    const loadConversations = useCallback(async () => {
        setListLoading(true);
        setListError("");
        try {
            const result = await apiAll<Conversation>("/conversations");
            setConversations(result);
            setSelectedId((current) => result.some((conversation) => conversation.id === current) ? current : result[0]?.id ?? "");
        } catch (error) {
            setListError(messageError(error));
        } finally {
            setListLoading(false);
        }
    }, []);

    useEffect(() => {
        if (sessionLoading) return;
        if (!user) {
            setConversations([]); setSelectedId(""); setListLoading(false);
            return;
        }
        void loadConversations();
    }, [sessionLoading, user, loadConversations]);

    const loadMessages = useCallback(async () => {
        if (!selectedId) return;
        const request = ++messagesRequest.current;
        setMessagesLoading(true);
        setMessagesError("");
        try {
            const result = await apiAll<Message>(`/conversations/${encodeURIComponent(selectedId)}/messages`);
            if (request === messagesRequest.current && currentId.current === selectedId) setMessages(result);
        } catch (error) {
            if (request === messagesRequest.current && currentId.current === selectedId) setMessagesError(messageError(error));
        } finally {
            if (request === messagesRequest.current) setMessagesLoading(false);
        }
    }, [selectedId]);

    useEffect(() => {
        setMessages([]); setDraft(""); setSendError(""); setMessagesError("");
        if (!selectedId || !user) return;
        void loadMessages();
        const interval = window.setInterval(() => void loadMessages(), 15000);
        return () => { messagesRequest.current += 1; window.clearInterval(interval); };
    }, [selectedId, user, loadMessages]);

    const selected = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) ?? null, [conversations, selectedId]);
    const recipient = selected?.members.find((member) => member.id !== user?.id);

    async function send(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const body = draft.trim();
        if (!body || !selectedId || sending) return;
        setSending(true); setSendError("");
        try {
            const created = await api<Message>(`/conversations/${encodeURIComponent(selectedId)}/messages`, {
                method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({body}),
            });
            if (currentId.current !== selectedId) return;
            messagesRequest.current += 1;
            setMessagesLoading(false);
            setMessages((current) => current.some((message) => message.id === created.id) ? current : [...current, created]);
            setDraft("");
        } catch (error) { if (currentId.current === selectedId) setSendError(messageError(error)); }
        finally { setSending(false); }
    }

    if (sessionLoading) return <div className="integration-card integration-state" role="status">Checking your session…</div>;
    if (!user) return <div className="integration-card chat-gate">
        <span className="chat-empty-icon"><ShieldCheck size={22} /></span>
        <h2>Sign in to see your conversations</h2>
        <p>Private chats are only available to the people involved in a lost-and-found match.</p>
        <Link className="button primary" href="/account?next=%2Fchat">Sign in or create an account</Link>
    </div>;

    return <div className="chat-workspace">
        <aside className="integration-card conversation-list" aria-label="Your conversations">
            <div className="conversation-list-heading"><div><h2>Conversations</h2><span>{conversations.length} {conversations.length === 1 ? "chat" : "chats"}</span></div>
                <button className="icon-button" type="button" aria-label="Refresh conversations" onClick={() => void loadConversations()} disabled={listLoading}><RefreshCw size={16} className={listLoading ? "spin" : ""} /></button>
            </div>
            {listError && <p className="integration-error" role="alert">{listError}</p>}
            {listLoading ? <p className="integration-state">Loading conversations…</p> : conversations.length === 0 ?
                <div className="conversation-empty"><MessageCircle size={22} /><strong>No conversations yet</strong><span>When an item match connects you with someone, your private chat will appear here.</span><Link href="/report">Create a report</Link></div> :
                <ul className="conversation-items">{conversations.map((conversation) => {
                    const other = conversation.members.find((member) => member.id !== user.id);
                    return <li key={conversation.id}><button type="button" className={`conversation-option${selectedId === conversation.id ? " active" : ""}`} aria-current={selectedId === conversation.id ? "true" : undefined} onClick={() => setSelectedId(conversation.id)}>
                        <span className="conversation-avatar">{other?.display_name.trim().slice(0, 1).toUpperCase() ?? "?"}</span><span className="conversation-copy"><strong>{other?.display_name ?? "Your match"}</strong><small>Private item conversation</small></span>
                    </button></li>;
                })}</ul>}
        </aside>
        <section className="integration-card conversation-view" aria-label="Conversation messages">
            {selected ? <>
                <header className="conversation-header"><span className="conversation-avatar">{recipient?.display_name.trim().slice(0, 1).toUpperCase() ?? "?"}</span>
                    <div><h2>{recipient?.display_name ?? "Your match"}</h2><span><ShieldCheck size={13} /> Private conversation</span></div>
                    <nav className="conversation-reports" aria-label="Matched reports">
                        <Link href={`/items/${encodeURIComponent(selected.lost_id)}`}>Lost report</Link>
                        <Link href={`/items/${encodeURIComponent(selected.found_id)}`}>Found report</Link>
                    </nav>
                    <button className="icon-button" type="button" aria-label="Refresh messages" onClick={() => void loadMessages()} disabled={messagesLoading}><RefreshCw size={16} className={messagesLoading ? "spin" : ""} /></button>
                </header>
                <div className="message-list" aria-live="polite" aria-busy={messagesLoading}>
                    {messagesLoading && messages.length === 0 ? <p className="integration-state">Loading messages…</p> : messagesError ?
                        <div className="chat-inline-state"><p className="integration-error" role="alert">{messagesError}</p><button type="button" className="button secondary" onClick={() => void loadMessages()}>Try again</button></div> : messages.length === 0 ?
                        <div className="chat-first-message"><span className="chat-empty-icon"><MessageCircle size={21} /></span><strong>Start the conversation</strong><span>Send a friendly message to help reunite an item with its owner.</span></div> : messages.map((message) => {
                            const mine = message.sender_id === user.id;
                            return <article key={message.id} className={`chat-bubble${mine ? " mine" : ""}`}><p>{message.body}</p><time dateTime={message.created_at}>{formatDate(message.created_at)}</time></article>;
                        })}
                </div>
                <form className="message-form" onSubmit={send}>
                    {sendError && <p className="integration-error" role="alert">{sendError}</p>}
                    <label className="visually-hidden" htmlFor="chat-message">Write a message</label>
                    <textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={2} placeholder="Write a message…" disabled={sending} />
                    <div className="message-form-bottom"><small>{draft.length}/4000</small><button className="button primary" type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}<Send size={15} /></button></div>
                </form>
            </> : <div className="conversation-placeholder"><span className="chat-empty-icon"><MessageCircle size={22} /></span><strong>{listLoading ? "Loading conversations…" : "Choose a conversation"}</strong><span>Your messages will appear here.</span></div>}
        </section>
    </div>;
}
