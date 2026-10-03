import {Suspense} from "react";
import {ReportForm} from "@/components/report-form";
export const metadata = {title: "Report an item"};
export default async function Page({searchParams}: {
    searchParams: Promise<{type?: string | string[]}>;
}) {
    const type = (await searchParams).type === "FOUND" ? "found" : "lost";
    return (
        <section className="container report-page" data-report-type={type}>
            <div className="page-heading centered">
                <span className="eyebrow green-text">
                    {type === "lost" ? "LOST SOMETHING? LET’S FIND IT." : "FOUND SOMETHING? MAKE SOMEONE’S DAY."}
                </span>
                <h1>
                    One report.
                    <br />
                    <span>A world of possibility.</span>
                </h1>
                <p>Record the details of something you’ve {type}.</p>
            </div>
            <Suspense fallback={<div className="skeleton" />}>
                <ReportForm />
            </Suspense>
        </section>
    );
}
