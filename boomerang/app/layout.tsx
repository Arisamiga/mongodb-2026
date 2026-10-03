import type {Metadata} from "next";
import Link from "next/link";
import {ScanLine, ArrowUpRight, Heart} from "lucide-react";
import {Nav} from "@/components/nav";
import {isDemo} from "@/lib/items";
import "./globals.css";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: {
        default: "Lost&Found AI — Good things find their way back",
        template: "%s | Lost&Found AI",
    },
    description:
        "A little community. A lot of possibility. Report lost and found items and help good things find their way home.",
};
export default function RootLayout({children}: {children: React.ReactNode}) {
    return (
        <html lang="en">
            <body>
                <a href="#main" className="skip-link">
                    Skip to content
                </a>
                <Nav />
                {isDemo() && (
                    <div className="demo-bar">
                        Demo workspace · Sample listings and reports are stored
                        locally.
                    </div>
                )}
                <main id="main">{children}</main>
                <footer>
                    <div className="container footer-top">
                        <Link href="/" className="brand">
                            <span className="logo small">
                                <ScanLine size={19} />
                            </span>
                            Lost&Found <span className="ai-tag">AI</span>
                        </Link>
                        <span>Good things find their way back.</span>
                        <Link href="/report">
                            Make someone’s day <ArrowUpRight size={15} />
                        </Link>
                    </div>
                    <div className="container footer-bottom">
                        <span>© {new Date().getFullYear()} Lost&Found AI</span>
                        <span>
                            Built for community, with <Heart size={12} /> and
                            MongoDB.
                        </span>
                    </div>
                </footer>
            </body>
        </html>
    );
}
