"use client";
import {useState} from "react";
import {useSearchParams} from "next/navigation";
import Link from "next/link";
import {
    ArrowRight,
    LoaderCircle,
    ShieldCheck,
    CheckCircle2,
} from "lucide-react";
import {categories, type Item} from "@/lib/types";
import {api} from "@/lib/api";
import {useSession} from "@/components/session-provider";
import {LocationInput} from "@/components/location-input";
import {PhotoInput} from "@/components/photo-input";
export function ReportForm() {
    const params = useSearchParams();
    const type = params.get("type") === "FOUND" ? "FOUND" : "LOST";
    return <ReportDetails key={type} type={type} />;
}

function ReportDetails({type}: {type: "LOST" | "FOUND"}) {
    const {user, loading} = useSession();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [submitted, setSubmitted] = useState<Item | null>(null);
    const [photos, setPhotos] = useState<string[]>([]);
    const [photosBusy, setPhotosBusy] = useState(false);
    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (photosBusy) return;
        setBusy(true);
        setError("");
        const form = event.currentTarget;
        const payload = Object.fromEntries(new FormData(form)) as Record<string, string>;
        try {
            const item = await api<Item>("/items", {method: "POST", body: JSON.stringify({
                title: payload.title,
                type: type.toLowerCase(),
                category: payload.category,
                description: payload.description,
                location: {coordinates: [Number(payload.longitude), Number(payload.latitude)]},
                eventDate: `${payload.eventDate}T00:00:00.000Z`,
            })});
            setSubmitted(item);
            if (photos.length) {
                for (const [index, photo] of photos.entries()) {
                    const upload = new FormData();
                    upload.append("file", await (await fetch(photo)).blob(), `photo-${index + 1}.jpg`);
                    await api(`/items/${item._id}/images`, {method: "POST", body: upload});
                }
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : "Your report could not be saved. Please try again.");
        } finally {
            setBusy(false);
        }
    }
    if (loading) return <p role="status">Checking your account…</p>;
    if (!user) return <div className="report-form"><h2>Sign in to publish a report</h2>
        <p>Your account keeps your reports, photos, and match conversations together.</p>
        <Link className="button" href={`/account?next=${encodeURIComponent(`/report?type=${type}`)}`}>Sign in or create an account</Link>
    </div>;
    if (submitted) {
        return (
            <div><div className="success-message" role="status">
                <CheckCircle2 size={22} />
                <div>
                    <strong>Your {type === "LOST" ? "lost" : "found"} report has been saved.</strong>
                    <span> {submitted.matchingStatus === "failed"
                        ? "Matching is currently unavailable. Your report is safely saved; retry from My reports."
                        : "Matching has been checked. Any qualifying matches appear in Chat."}</span>
                </div>
            </div>
            {busy && <p role="status">Uploading photos…</p>}
            {error && <p role="alert" className="error-message">Your report is saved, but the photos could not be uploaded: {error} You can retry from the report without publishing a duplicate.</p>}
            <Link className="button" href={`/items/${submitted._id}`}>View report</Link>{" "}
            <Link className="button" href="/account">My reports</Link>{" "}
            <Link className="button" href="/chat">Open chat</Link>
            </div>
        );
    }
    return (
        <form onSubmit={submit} className="report-form">
            <fieldset disabled={busy}>
                <h2>The little details matter.</h2>
                <p className="form-intro">
                    Add the details you want to keep with this report. All
                    fields are required except the photo.
                </p>
                <label>
                    Item name
                    <input
                        required
                        name="title"
                        minLength={3}
                        maxLength={100}
                        placeholder="e.g. Black Sony wireless headphones"
                    />
                </label>
                <div className="form-row">
                    <label>
                        Category
                        <select required name="category" defaultValue="">
                            <option value="" disabled>
                                Select a category
                            </option>
                            {categories.map((c) => (
                                <option key={c}>{c}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Date {type === "LOST" ? "lost" : "found"}
                        <input
                            required
                            type="date"
                            name="eventDate"
                            max={new Date().toISOString().slice(0, 10)}
                        />
                    </label>
                </div>
                <LocationInput label={`Where was it ${type.toLowerCase()}?`} />
                <label>
                    Description
                    <textarea
                        required
                        name="description"
                        minLength={20}
                        maxLength={2000}
                        rows={4}
                        placeholder="Color, brand, and anything that makes it unique. Keep one identifying detail private for a safe handover."
                    />
                </label>
                <PhotoInput photos={photos} onChange={setPhotos} onBusy={setPhotosBusy} />
                <div className="form-divider" />
                <p>Publishing as {user.display_name}. Your email is not included in public reports.</p>
                <label className="consent">
                    <input type="checkbox" required />I agree to share these item details and coordinates with signed-in users.
                </label>
                {error && (
                    <div role="alert" className="error-message">
                        {error}
                    </div>
                )}
                <button
                    className={`button ${type === "LOST" ? "report-lost" : "report-found"} submit-button`}
                    disabled={busy || photosBusy}
                >
                    {busy ? (
                        <>
                            <LoaderCircle size={18} className="spin" />
                            Saving your report…
                        </>
                    ) : (
                        <>
                            Publish report
                            <ArrowRight size={18} />
                        </>
                    )}
                </button>
                <p className="form-note">
                    <ShieldCheck size={15} />
                    Photos are private to you and qualifying match participants.
                </p>
            </fieldset>
        </form>
    );
}
