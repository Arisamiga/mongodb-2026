import Link from "next/link";
import {ArrowUpRight, Search, HandHeart, ShieldCheck, ClipboardList, HeartHandshake} from "lucide-react";

export default function Home() {
    return (
        <>
            <section className="container home-hero">
                <span className="pill"><span className="live-dot" /> Less lost. More found.</span>
                <h1>Good things find<br /><span>their way back.</span></h1>
                <p>Lost something or found something? Start here.<br />A small action can make someone’s whole day.</p>
                <div className="home-actions">
                    <Link href="/report?type=LOST" className="home-action lost-action">
                        <Search size={32} />
                        <strong>I lost something</strong>
                        <span>Share the details. Let’s help you find it.</span>
                        <ArrowUpRight size={24} className="action-arrow" />
                    </Link>
                    <Link href="/report?type=FOUND" className="home-action found-action">
                        <HandHeart size={32} />
                        <strong>I found something</strong>
                        <span>Make someone’s day. Let’s get it home.</span>
                        <ArrowUpRight size={24} className="action-arrow" />
                    </Link>
                </div>
                <Link href="/search" className="text-link home-search"><Search size={17} /> Looking for a specific item? Search reports <ArrowUpRight size={16} /></Link>
                <div className="hero-note"><ShieldCheck size={16} /><span>Free to use</span><i />No sign-up needed</div>
            </section>
            <section className="how-section">
                <div className="container">
                    <div className="center-heading">
                        <span className="eyebrow green-text">SIMPLE STEPS. HAPPY REUNIONS.</span>
                        <h2>Back where it belongs.</h2>
                        <p>A few minutes of your time could make someone’s whole day.</p>
                    </div>
                    <div className="steps">
                        {[
                            [ClipboardList, "01", "Share the details", "Lost it or found it? Add a description, location, and a photo to create your report."],
                            [Search, "02", "Search for your item", "Describe what you’re looking for or where it went missing to find matching reports."],
                            [HeartHandshake, "03", "Make the connection", "Recognize an item? Reach out to the reporter and arrange a safe handover."],
                        ].map(([Icon, num, title, copy]) => {
                            const I = Icon as typeof Search;
                            return (
                                <div className="step" key={String(num)}>
                                    <div className="step-top"><span className="step-icon"><I size={24} /></span><span className="step-number">{String(num)}</span></div>
                                    <h3>{String(title)}</h3><p>{String(copy)}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>
            <section className="container final-cta">
                <div><h2>Be someone’s good news.</h2><p>Found something? A small act of kindness starts here.</p></div>
                <Link href="/report?type=FOUND" className="button primary">Report a found item <ArrowUpRight size={18} /></Link>
            </section>
        </>
    );
}
