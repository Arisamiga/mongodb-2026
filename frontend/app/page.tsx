import {ShieldCheck} from "lucide-react";

export default function Home() {
    return (
        <section className="container home-hero">
            <span className="pill">
                <span className="live-dot" /> Less lost. More found.
            </span>
            <h1>
                Good things find
                <br />
                <span>their way back.</span>
            </h1>
            <p>
                Choose Lost or Found in the navigation to get started.
                <br />
                A small action can make someone’s whole day.
            </p>
            <div className="hero-note">
                <ShieldCheck size={16} />
                <span>Free to use</span>
                <i />
                No sign-up needed
            </div>
        </section>
    );
}
