"use client";

import Link from "next/link";
import {useParams} from "next/navigation";
import {useCallback, useEffect, useState} from "react";
import {api} from "@/lib/api";
import type {Item} from "@/lib/types";
import {useSession} from "@/components/session-provider";

type ImageInfo = {id: string; url: string};

export default function ItemPage() {
    const {id} = useParams<{id: string}>();
    const {user, loading} = useSession();
    const [item, setItem] = useState<Item | null>(null);
    const [images, setImages] = useState<ImageInfo[]>([]);
    const [error, setError] = useState("");
    const [imageError, setImageError] = useState("");
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => {
        setError("");
        try {
            setItem(await api<Item>(`/items/${id}`));
            try {
                setImages(await api<ImageInfo[]>(`/items/${id}/images`));
                setImageError("");
            } catch {
                setImages([]);
                setImageError("Photos are only available to the report owner and qualifying match participants.");
            }
        } catch (error) { setError(error instanceof Error ? error.message : "Could not load report."); }
    }, [id]);
    useEffect(() => {
        setItem(null);
        setImages([]);
        if (user) void load();
    }, [user, load]);

    async function update(path: string, body?: object) {
        setBusy(true);
        setError("");
        try {
            await api(path, {method: body ? "PATCH" : "POST", body: body ? JSON.stringify(body) : undefined});
            await load();
        } catch (error) { setError(error instanceof Error ? error.message : "Could not update report."); }
        finally { setBusy(false); }
    }

    async function upload(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        setBusy(true);
        setError("");
        try {
            await api(`/items/${id}/images`, {method: "POST", body: new FormData(form)});
            form.reset();
            await load();
        } catch (error) { setError(error instanceof Error ? error.message : "Could not upload photo."); }
        finally { setBusy(false); }
    }

    return <section className="container integration-page">
        <Link href="/account">← My reports</Link>
        <h1>Report details</h1>
        {loading ? <p role="status">Checking your account…</p> : !user
            ? <Link className="button" href="/account">Sign in to view this report</Link>
            : <>
                {error && <p role="alert" className="error-message">{error}</p>}
                {!item && !error && <p role="status">Loading report…</p>}
                {item && <article className="report-form">
                    <h2>{item.title}</h2>
                    <p>{item.type} · {item.category} · {item.status}</p>
                    <p>{item.description}</p>
                    <p>Event date: {item.eventDate.slice(0, 10)}</p>
                    <p>Coordinates (longitude, latitude): {item.location.coordinates.join(", ")}</p>
                    <p role="status">Matching: {item.matchingStatus}{item.matchingStatus === "failed" ? ". Your report is saved; matching can be retried." : ""}</p>
                    <div className="photo-previews">
                        {images.map(image => <img key={image.id} src={`/api/backend${image.url}`} alt={`Photo of ${item.title}`} width={240} style={{maxWidth: "100%", objectFit: "contain"}} />)}
                    </div>
                    {imageError && <p>{imageError}</p>}
                    <Link className="button" href="/chat">Match conversations</Link>
                    {user.id === item.userId && <>
                        <h3>Manage report</h3>
                        <fieldset disabled={busy}>
                            {item.status === "open" && <button className="button" onClick={() => void update(`/items/${id}/match`)}>Retry matching</button>}
                            <label>Status
                                <select value={item.status} onChange={event => void update(`/items/${id}`, {status: event.target.value})}>
                                    <option value="open">Open</option><option value="matched">Matched</option><option value="returned">Returned</option>
                                </select>
                            </label>
                        </fieldset>
                        <form onSubmit={upload}>
                            <fieldset disabled={busy}>
                                <label>Add a photo<input type="file" name="file" accept="image/jpeg,image/png,image/webp" required /></label>
                                <p>Up to 8 photos per report, 5 MB each. Only you and matched participants can view them.</p>
                                <button className="button">Upload photo</button>
                            </fieldset>
                        </form>
                    </>}
                </article>}
            </>}
    </section>;
}
