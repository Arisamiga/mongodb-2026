import type {Metadata} from "next";
import Link from "next/link";
import {ArrowUpRight, Heart} from "lucide-react";
import {Nunito} from "next/font/google";
import {Brand} from "@/components/brand";
import {Nav} from "@/components/nav";
import "./globals.css";

const boomerangFont = Nunito({
    subsets: ["latin"],
    variable: "--font-boomerang",
    display: "swap",
});

export const metadata: Metadata = {
    title: {
        default: "Boomerang — Good things find their way back",
        template: "%s | Boomerang",
    },
    description:
        "A simple way to record the details of something you have lost or found.",
    icons: {icon: "/brand/boomerang-mark.png"},
};
export default function RootLayout({children}: {children: React.ReactNode}) {
    return (
        <html lang="en" className={boomerangFont.variable}>
            <body>
                <a href="#main" className="skip-link">
                    Skip to content
                </a>
                <Nav />
                <main id="main">{children}</main>
                <footer>
                    <div className="container footer-top">
                        <Link href="/" className="brand">
                            <Brand />
                        </Link>
                        <span>Good things find their way back.</span>
                        <Link href="/report?type=FOUND">
                            Report a found item <ArrowUpRight size={15} />
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
