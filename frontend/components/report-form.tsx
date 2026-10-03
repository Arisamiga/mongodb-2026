"use client";
import {useState} from "react";
import {useSearchParams} from "next/navigation";
import {
    ArrowRight,
    LoaderCircle,
    ShieldCheck,
    CheckCircle2,
} from "lucide-react";
import {categories} from "@/lib/types";
import {saveItem} from "@/lib/store";
import {LocationInput} from "@/components/location-input";
import {PhotoInput} from "@/components/photo-input";
export function ReportForm() {
    const params = useSearchParams();
    const type = params.get("type") === "FOUND" ? "FOUND" : "LOST";
    return <ReportDetails key={type} type={type} />;
}

function ReportDetails({type}: {type: "LOST" | "FOUND"}) {
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [submitted, setSubmitted] = useState(false);
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
            saveItem({
                title: payload.title,
                type,
                category: payload.category as (typeof categories)[number],
                description: payload.description,
                location: payload.location,
                coordinates: [Number(payload.longitude), Number(payload.latitude)],
                eventDate: payload.eventDate,
                contactEmail: payload.contactEmail,
                imageUrl: photos[0] ?? "",
                photos,
            });
            setSubmitted(true);
        } catch {
            setError("Your browser could not save this report. Storage may be full or unavailable. Try removing photos and saving again.");
            setBusy(false);
        }
    }
    if (submitted) {
        return (
            <div className="success-message" role="status">
                <CheckCircle2 size={22} />
                <div>
                    <strong>Your {type === "LOST" ? "lost" : "found"} report has been saved.</strong>
                    <span> It is stored in this browser on this device.</span>
                </div>
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
                <label>
                    Your email
                    <input
                        required
                        type="email"
                        name="contactEmail"
                        maxLength={254}
                        placeholder="you@example.com"
                    />
                    <small>
                        Your email is saved with this report in this browser; it
                        is not shared online by this frontend.
                    </small>
                </label>
                <label className="consent">
                    <input type="checkbox" required />I agree to save my email
                    with this report in this browser.
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
                    No account needed. Just a little community spirit.
                </p>
            </fieldset>
        </form>
    );
}
