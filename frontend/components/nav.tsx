"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {ScanLine, Plus, Menu, X} from "lucide-react";
import {useState} from "react";
export function Nav() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    return (
        <header className="nav">
            <div className="container nav-inner">
                <Link href="/" className="brand">
                    <span className="logo">
                        <ScanLine size={24} />
                    </span>
                    Boomerang
                </Link>
                <nav
                    className={open ? "nav-links open" : "nav-links"}
                    aria-label="Main navigation"
                >
                    {[
                        ["/", "Home"],
                        ["/browse", "Browse Items"],
                        ["/report", "Report Item"],
                    ].map(([url, label]) => (
                        <Link
                            key={url}
                            href={url}
                            className={pathname === url ? "active" : ""}
                            onClick={() => setOpen(false)}
                        >
                            {label}
                        </Link>
                    ))}
                </nav>
                <Link href="/report" className="button primary nav-cta">
                    <Plus size={17} />
                    Report an Item
                </Link>
                <button
                    className="mobile-toggle"
                    aria-label="Toggle navigation"
                    aria-expanded={open}
                    onClick={() => setOpen(!open)}
                >
                    {open ? <X /> : <Menu />}
                </button>
            </div>
        </header>
    );
}
