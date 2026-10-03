"use client";
import {useState} from "react";
import {useSearchParams} from "next/navigation";
import {
    PackageX,
    HandHeart,
    ArrowRight,
    LoaderCircle,
    ShieldCheck,
    ImagePlus,
    CheckCircle2,
} from "lucide-react";
import {categories} from "@/lib/types";
import {saveItem} from "@/lib/store";
export function ReportForm() {
    const params = useSearchParams();
    const [type, setType] = useState(
        params.get("type") === "FOUND" ? "FOUND" : "LOST",
    );
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        const form = event.currentTarget;
        const payload = Object.fromEntries(new FormData(form)) as Record<string, string>;
        try {
            saveItem({
                title: payload.title,
                type: type as "LOST" | "FOUND",
                category: payload.category as (typeof categories)[number],
                description: payload.description,
                location: payload.location,
                eventDate: payload.eventDate,
                contactEmail: payload.contactEmail,
                imageUrl: payload.imageUrl,
            });
            setSubmitted(true);
        } catch {
            setError("Your browser could not save this report. Check that local storage is available and try again.");
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
                <legend className="field-heading">
                    First, what brings you here?
                </legend>
                <div className="type-picker">
                    {[
                        [
                            "LOST",
                            PackageX,
                            "I lost something",
                            "Let’s help you find it.",
                        ],
                        [
                            "FOUND",
                            HandHeart,
                            "I found something",
                            "Let’s get it home.",
                        ],
                    ].map(([value, Icon, title, copy]) => {
                        const I = Icon as typeof PackageX;
                        return (
                            <button
                                key={String(value)}
                                type="button"
                                className={`${String(value).toLowerCase()} ${type === value ? "chosen" : ""}`}
                                aria-pressed={type === value}
                                onClick={() => setType(String(value))}
                            >
                                <I size={23} />
                                <span>
                                    <strong>{String(title)}</strong>
                                    <small>{String(copy)}</small>
                                </span>
                                <i />
                            </button>
                        );
                    })}
                </div>
                <div className="form-divider" />
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
                <label>
                    Where was it {type.toLowerCase()}?
                    <input
                        required
                        name="location"
                        minLength={3}
                        maxLength={160}
                        placeholder="e.g. O’Reilly Library, DCU"
                    />
                </label>
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
                <label>
                    <span className="inline-label">
                        <ImagePlus size={16} />
                        Photo URL <span className="optional">(optional)</span>
                    </span>
                    <input
                        name="imageUrl"
                        type="url"
                        maxLength={2048}
                        placeholder="https://…"
                    />
                    <small>
                        Add a publicly accessible HTTPS image link. Avoid photos
                        of IDs or personal details.
                    </small>
                </label>
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
                    disabled={busy}
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
