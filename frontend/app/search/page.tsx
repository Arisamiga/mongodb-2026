import {Browse} from "@/components/browse";

export const metadata = {title: "Search items"};

export default function Page() {
    return (
        <section className="container page-section">
            <div className="page-heading">
                <span className="eyebrow green-text">LOOK FOR WHAT MATTERS</span>
                <h1>Something missing?<br /><span>Start with a search.</span></h1>
                <p>Describe your item or where you last saw it to find matching reports.</p>
            </div>
            <Browse searchOnly />
        </section>
    );
}
