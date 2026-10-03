import Link from "next/link";
import {Search} from "lucide-react";
export default function NotFound() {
    return (
        <div className="container empty-state page-section">
            <Search size={40} />
            <h1>This page is a little lost.</h1>
            <p>The item or page you’re looking for isn’t here.</p>
            <Link className="button primary" href="/search">
                Search for an item
            </Link>
        </div>
    );
}
