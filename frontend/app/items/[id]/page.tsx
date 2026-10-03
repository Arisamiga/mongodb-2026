import {Suspense} from "react";
import {ItemDetails} from "@/components/item-details";
export default function Page() {
    return <Suspense fallback={<section className="container detail-page"><div className="skeleton" /></section>}><ItemDetails /></Suspense>;
}
