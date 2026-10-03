import type {Metadata} from "next";
import Link from "next/link";
import {ScanLine, ArrowUpRight, Heart} from "lucide-react";
import {Nav} from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
    title: {
        default: "Boomerang — Good things find their way back",
        template: "%s | Boomerang",
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
                <main id="main">{children}</main>
                <footer>
                    <div className="container footer-top">
                        <Link href="/" className="brand">
                            <span className="logo small">
                                <ScanLine size={19} />
                            </span>
                            Boomerang
                        </Link>
                        <span>Good things find their way back.</span>
                        <Link href="/report">
                            Make someone’s day <ArrowUpRight size={15} />
                        </Link>
                    </div>
                    <div className="container footer-bottom">
                        <span>© {new Date().getFullYear()} Boomerang</span>
                        <span>
                            Built for community, with <Heart size={12} />.
                        </span>
                    </div>
                </footer>
            </body>
        </html>
    );
}
