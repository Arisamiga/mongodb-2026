import {Suspense} from "react";
import {ReportForm} from "@/components/report-form";
export const metadata = {title: "Report an item"};
export default function Page() {
    return (
        <section className="container report-page">
            <div className="page-heading centered">
                <span className="eyebrow green-text">LET’S BRING IT HOME</span>
                <h1>
                    One report.
                    <br />
                    <span>A world of possibility.</span>
                </h1>
                <p>Tell your community what you’ve lost or found.</p>
            </div>
            <Suspense fallback={<div className="skeleton" />}>
                <ReportForm />
            </Suspense>
        </section>
    );
}
