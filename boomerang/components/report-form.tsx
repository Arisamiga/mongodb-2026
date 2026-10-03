"use client";
import {useState} from "react";
import {useRouter, useSearchParams} from "next/navigation";
import {
    Search,
    HandHeart,
    ArrowRight,
    LoaderCircle,
    ShieldCheck,
    ImagePlus,
} from "lucide-react";
import {categories} from "@/lib/types";
export function ReportForm() {
    const params = useSearchParams();
    const [type, setType] = useState(
        params.get("type") === "FOUND" ? "FOUND" : "LOST",
    );
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const router = useRouter();
    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        const payload = {
            ...Object.fromEntries(new FormData(event.currentTarget)),
            type,
        };
        try {
            const res = await fetch("/api/items", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            router.push(`/items/${data.item.id}?created=1`);
        } catch (e) {
            setError((e as Error).message);
            setBusy(false);
        }
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
                            Search,
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
                        const I = Icon as typeof Search;
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
                    The more you share, the easier it is to recognize. All
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
                        Your email will be visible on this item’s detail page so
                        people can contact you.
                    </small>
                </label>
                <label className="consent">
                    <input type="checkbox" required />I agree to share my email
                    publicly for this report.
                </label>
                {error && (
                    <div role="alert" className="error-message">
                        {error}
                    </div>
                )}
                <button
                    className="button primary submit-button"
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
