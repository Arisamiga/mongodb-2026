import Link from "next/link";
import {Home} from "lucide-react";

export default function NotFound() {
    return (
        <div className="container empty-state page-section">
            <Home size={40} />
            <h1>This page is a little lost.</h1>
            <p>Choose Lost or Found to report an item.</p>
            <Link className="button primary" href="/">
                Back to Boomerang
            </Link>
        </div>
    );
}
