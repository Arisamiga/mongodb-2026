import {Browse} from "@/components/browse";
export const metadata = {title: "Browse items"};
export default function Page() {
    return (
        <section className="container page-section">
            <div className="page-heading">
                <span className="eyebrow green-text">THE COMMUNITY BOARD</span>
                <h1>
                    Find a familiar face.
                    <br />
                    <span>Or a familiar backpack.</span>
                </h1>
                <p>Lost, found, and one connection away from home.</p>
            </div>
            <Browse />
        </section>
    );
}
