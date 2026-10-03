"use client";
import {useEffect, useState} from "react";
import Link from "next/link";
import {useParams, useSearchParams} from "next/navigation";
import {ArrowLeft, MapPin, CalendarDays, Mail, ShieldCheck, CheckCircle2, Sparkles} from "lucide-react";
import type {Item} from "@/lib/types";
import {findItem} from "@/lib/store";
import {ItemPhoto} from "@/components/item-photo";

export function ItemDetails() {
    const params = useParams<{id: string}>();
    const search = useSearchParams();
    const [item, setItem] = useState<Item>();
    useEffect(() => setItem(findItem(params.id)), [params.id]);
    if (!item) return <section className="container detail-page"><Link className="back-link" href="/browse"><ArrowLeft size={16} />Back to the community board</Link><div className="empty-state"><h1>Item not found</h1><p>This report may have been cleared from this browser.</p></div></section>;
    const created = search.get("created");
    return <section className="container detail-page">
        <Link className="back-link" href="/browse"><ArrowLeft size={16} />Back to the community board</Link>
        {created && <div className="success-message"><CheckCircle2 size={20} /><div><strong>Your report is saved in this browser.</strong><span> It is visible here on this device.</span></div></div>}
        <div className="detail-grid"><div className="detail-image"><ItemPhoto src={item.imageUrl} alt={item.title} /></div><div className="detail-copy">
            <span className={`badge ${item.type.toLowerCase()}`}><i />{item.type}</span><span className="detail-category">{item.category}</span><h1>{item.title}</h1>
            <p className="detail-meta"><MapPin size={18} />{item.location}</p>
            <p className="detail-meta"><CalendarDays size={18} />{item.type === "LOST" ? "Lost" : "Found"} on {new Date(item.eventDate + "T12:00:00Z").toLocaleDateString("en-IE", {day:"numeric", month:"long", year:"numeric", timeZone:"UTC"})}</p>
            <div className="form-divider" /><h3>Does this sound familiar?</h3><p className="description">{item.description}</p>
            <a className="button primary" href={`mailto:${encodeURIComponent(item.contactEmail)}?subject=${encodeURIComponent(`Boomerang: ${item.title}`)}`}><Mail size={18} />Contact the reporter</a><p className="contact-email">{item.contactEmail}</p>
            {item.id.startsWith("demo-") && <p className="sample-note">This is a sample listing. Its email address is for demonstration only.</p>}
            <div className="safety-note"><ShieldCheck size={21} /><p><strong>A safe reunion starts with a little care.</strong> Confirm a detail only the owner would know and arrange to meet in a public place.</p></div>
        </div></div>
        <div className="detail-ai"><Sparkles size={22} /><div><h3>Good connections are getting smarter.</h3><p>Intelligent item matching is coming soon. For now, explore the community board.</p></div><Link className="text-link" href="/browse">Browse items →</Link></div>
    </section>;
}
