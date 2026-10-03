import Link from "next/link";
import {ArrowUpRight, HandHeart, PackageX, ShieldCheck} from "lucide-react";

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
                Choose what happened and tell your community about it.
                <br />
                A small action can make someone’s whole day.
            </p>
            <div className="home-actions">
                <Link href="/report?type=LOST" className="home-action lost-action">
                    <PackageX size={32} />
                    <strong>Lost</strong>
                    <span>Report something you’ve lost.</span>
                    <ArrowUpRight size={24} className="action-arrow" />
                </Link>
                <Link href="/report?type=FOUND" className="home-action found-action">
                    <HandHeart size={32} />
                    <strong>Found</strong>
                    <span>Report something you’ve found.</span>
                    <ArrowUpRight size={24} className="action-arrow" />
                </Link>
            </div>
            <div className="hero-note">
                <ShieldCheck size={16} />
                <span>Free to use</span>
                <i />
                No sign-up needed
            </div>
        </section>
    );
}
