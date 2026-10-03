import {ChatPanel} from "@/components/chat-panel";

export const metadata = {title: "Chat"};

export default function ChatPage() {
    return <section className="container integration-page chat-page">
        <header className="integration-heading">
            <span className="eyebrow green-text">PRIVATE CONVERSATIONS</span>
            <h1>Let’s bring things back together.</h1>
            <p>Talk directly with the people connected to your lost or found item.</p>
        </header>
        <ChatPanel />
    </section>;
}
