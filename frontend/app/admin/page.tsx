import {Browse} from "@/components/browse";

export const metadata = {title: "Admin — Browse items", robots: {index: false, follow: false}};

export default function Page() {
    return (
        <section className="container page-section">
            <div className="page-heading">
                <span className="eyebrow green-text">ADMINISTRATION</span>
                <h1>Community board.</h1>
                <p>Browse and filter all reports stored in this browser.</p>
            </div>
            <Browse />
        </section>
    );
}
