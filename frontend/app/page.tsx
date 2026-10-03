import Link from "next/link";
import {
    ArrowRight,
    ArrowUpRight,
    Search,
    Plus,
    Sparkles,
    MapPin,
    Check,
    ClipboardList,
    HeartHandshake,
    ShieldCheck,
} from "lucide-react";
import {listItems} from "@/lib/items";
import {ItemCard} from "@/components/item-card";
export const dynamic = "force-dynamic";
export default async function Home() {
    let items: Awaited<ReturnType<typeof listItems>> = [];
    let unavailable = false;
    try {
        items = (await listItems()).slice(0, 3);
    } catch {
        unavailable = true;
    }
    return (
        <>
            <section className="hero container">
                <div className="hero-copy">
                    <span className="pill">
                        <span className="live-dot" /> A little community. A lot
                        of possibility.
                    </span>
                    <h1>
                        Lost something?
                        <br />
                        Let’s find its
                        <br />
                        <span>way back.</span>
                        <svg
                            className="underline"
                            viewBox="0 0 320 15"
                            aria-hidden="true"
                        >
                            <path
                                d="M3 11 Q155 -4 314 7"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="5"
                                strokeLinecap="round"
                            />
                        </svg>
                    </h1>
                    <p>
                        From everyday essentials to things you can’t replace.
                        <br className="desktop-break" /> Connect with your
                        community and bring lost things home.
                    </p>
                    <div className="hero-actions">
                        <Link
                            href="/report?type=LOST"
                            className="button report-lost"
                        >
                            <Search size={17} />Report Lost
                            <ArrowUpRight size={17} />
                        </Link>
                        <Link
                            href="/report?type=FOUND"
                            className="button report-found"
                        >
                            <Plus size={18} />Report Found
                        </Link>
                    </div>
                    <div className="hero-note">
                        <ShieldCheck size={16} />
                        <span>Free to use</span>
                        <i />
                        No sign-up needed
                        <i />
                        Made for everyone
                    </div>
                </div>
                <div className="hero-art">
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <span className="art-spark spark-one">✳</span>
                    <span className="art-spark spark-two">✦</span>
                    <div className="floating-note top-note">
                        <span className="note-icon">
                            <MapPin size={19} />
                        </span>
                        <div>
                            Closer than you think
                            <small>Your community has your back</small>
                        </div>
                    </div>
                    <img
                        className="boomerang-illustration"
                        src="/brand/boomerang-mark.png"
                        width={1080}
                        height={1157}
                        alt="A colorful boomerang circling back toward a location pin"
                    />
                    <div className="floating-note bottom-note">
                        <span className="success-icon">
                            <Check size={20} />
                        </span>
                        <div>
                            Every item has a story.
                            <small>Help it find a happy ending.</small>
                        </div>
                        <HeartHandshake size={24} className="muted" />
                    </div>
                    <span className="art-caption">LESS LOST. MORE FOUND.</span>
                </div>
            </section>
            <div className="community-strip">
                <div className="container strip-inner">
                    <span>
                        <HeartHandshake size={19} />
                        Small actions. Real connections.
                    </span>
                    <span>
                        <Check size={16} />
                        Report in minutes
                    </span>
                    <span>
                        <Check size={16} />
                        Find what matters
                    </span>
                    <span>
                        <Check size={16} />
                        Help someone out
                    </span>
                </div>
            </div>
            <section className="container section">
                <div className="section-heading">
                    <div>
                        <span className="eyebrow green-text">
                            THE COMMUNITY BOARD
                        </span>
                        <h2>A little lost. Almost found.</h2>
                        <p>
                            Recognize something? You could be the missing link.
                        </p>
                    </div>
                    <Link href="/browse" className="text-link">
                        Browse all items <ArrowRight size={17} />
                    </Link>
                </div>
                {unavailable ? (
                    <div className="empty-state">
                        <h3>The community board is temporarily unavailable.</h3>
                        <p>Please check back shortly.</p>
                    </div>
                ) : items.length ? (
                    <div className="item-grid">
                        {items.map((item) => (
                            <ItemCard key={item.id} item={item} />
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <h3>Every community starts with one report.</h3>
                        <Link href="/report" className="text-link">
                            Report the first item <ArrowRight size={16} />
                        </Link>
                    </div>
                )}
            </section>
            <section className="how-section">
                <div className="container">
                    <div className="center-heading">
                        <span className="eyebrow green-text">
                            SIMPLE STEPS. HAPPY REUNIONS.
                        </span>
                        <h2>Back where it belongs.</h2>
                        <p>
                            A few minutes of your time could make someone’s
                            whole day.
                        </p>
                    </div>
                    <div className="steps">
                        {[
                            [
                                ClipboardList,
                                "01",
                                "Share the details",
                                "Lost it or found it? Add a description, location, and a photo to get the word out.",
                            ],
                            [
                                Search,
                                "02",
                                "Look around",
                                "Explore the community board. Filter by item type and category to narrow it down.",
                            ],
                            [
                                HeartHandshake,
                                "03",
                                "Make the connection",
                                "Recognize an item? Reach out to the reporter and arrange a safe handover.",
                            ],
                        ].map(([Icon, num, title, copy]) => {
                            const I = Icon as typeof Search;
                            return (
                                <div className="step" key={String(num)}>
                                    <div className="step-top">
                                        <span className="step-icon">
                                            <I size={24} />
                                        </span>
                                        <span className="step-number">
                                            {String(num)}
                                        </span>
                                    </div>
                                    <h3>{String(title)}</h3>
                                    <p>{String(copy)}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>
            <section className="container">
                <div className="ai-banner">
                    <div className="ai-orb">
                        <Sparkles size={28} />
                    </div>
                    <div>
                        <span className="coming-soon">ON THE HORIZON</span>
                        <h2>A smarter way to reconnect.</h2>
                        <p>
                            We’re building intelligent matching to help the
                            right items find the right people.
                        </p>
                    </div>
                    <span className="soon-pill">
                        AI matching · Coming soon <Sparkles size={14} />
                    </span>
                </div>
            </section>
            <section className="container final-cta">
                <div>
                    <h2>Be someone’s good news.</h2>
                    <p>Found something? A small act of kindness starts here.</p>
                </div>
                <Link href="/report" className="button primary">
                    Report an item <ArrowUpRight size={18} />
                </Link>
            </section>
        </>
    );
}
